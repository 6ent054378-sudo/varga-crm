(function (C) {
  'use strict';

  var TARGET_RATE = 16000;
  var MAX_SECONDS = 120;

  // ---------- Запись в WAV 16 кГц, 16 бит, моно: так модель распознавания получает чистый звук без ffmpeg ----------
  function downsample(samples, fromRate, toRate) {
    if (toRate >= fromRate) return samples;
    var ratio = fromRate / toRate;
    var length = Math.floor(samples.length / ratio);
    var out = new Float32Array(length);
    for (var i = 0; i < length; i++) {
      var start = Math.floor(i * ratio);
      var end = Math.min(samples.length, Math.floor((i + 1) * ratio));
      var sum = 0;
      for (var j = start; j < end; j++) sum += samples[j];
      out[i] = end > start ? sum / (end - start) : 0;
    }
    return out;
  }

  function encodeWav(samples, rate) {
    var buffer = new ArrayBuffer(44 + samples.length * 2);
    var view = new DataView(buffer);
    function str(offset, text) {
      for (var i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i));
    }
    str(0, 'RIFF');
    view.setUint32(4, 36 + samples.length * 2, true);
    str(8, 'WAVE');
    str(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, rate, true);
    view.setUint32(28, rate * 2, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    str(36, 'data');
    view.setUint32(40, samples.length * 2, true);
    for (var i = 0; i < samples.length; i++) {
      var v = Math.max(-1, Math.min(1, samples[i]));
      view.setInt16(44 + i * 2, v < 0 ? v * 0x8000 : v * 0x7fff, true);
    }
    return buffer;
  }

  function merge(chunks) {
    var total = chunks.reduce(function (n, c) { return n + c.length; }, 0);
    var out = new Float32Array(total);
    var offset = 0;
    chunks.forEach(function (c) { out.set(c, offset); offset += c.length; });
    return out;
  }

  function supported() {
    return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia && (window.AudioContext || window.webkitAudioContext));
  }

  // start() возвращает объект записи: stop() отдаёт {wav, seconds, onsetMs, speechMs}, cancel() выбрасывает запись.
  // onLevel(0..1) вызывается во время записи, onLimit() когда достигнут предел длины.
  // Определение речи: endSilenceMs тишины после речи вызывает onEndSilence (ответ закончен),
  // noSpeechMs без единого слова вызывает onNoSpeech (клиент молчит), maxSeconds ограничивает ответ.
  function start(opts) {
    opts = opts || {};
    if (!supported()) return Promise.reject(new Error('Браузер не умеет записывать звук. Открой приложение в Chrome или Safari.'));
    return navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true } }).then(function (stream) {
      var Ctx = window.AudioContext || window.webkitAudioContext;
      var ctx = new Ctx();
      var source = ctx.createMediaStreamSource(stream);
      var node = ctx.createScriptProcessor(4096, 1, 1);
      var chunks = [];
      var active = true;
      var begun = Date.now();
      var onsetAt = 0;
      var lastVoiceAt = 0;
      var fired = false;
      var threshold = opts.voiceThreshold || 0.07;
      var maxMs = (opts.maxSeconds || MAX_SECONDS) * 1000;
      node.onaudioprocess = function (e) {
        if (!active) return;
        var data = new Float32Array(e.inputBuffer.getChannelData(0));
        chunks.push(data);
        var sum = 0;
        for (var i = 0; i < data.length; i++) sum += data[i] * data[i];
        var level = Math.min(1, Math.sqrt(sum / data.length) * 6);
        var now = Date.now();
        if (opts.onLevel) opts.onLevel(level);
        if (level >= threshold) {
          if (!onsetAt) {
            onsetAt = now;
            if (opts.onSpeech) opts.onSpeech();
          }
          lastVoiceAt = now;
        }
        if (fired) return;
        if (onsetAt && opts.endSilenceMs && now - lastVoiceAt > opts.endSilenceMs && opts.onEndSilence) {
          fired = true;
          opts.onEndSilence();
        } else if (!onsetAt && opts.noSpeechMs && now - begun > opts.noSpeechMs && opts.onNoSpeech) {
          fired = true;
          opts.onNoSpeech();
        } else if (now - begun > maxMs && opts.onLimit) {
          fired = true;
          opts.onLimit();
        }
      };
      source.connect(node);
      node.connect(ctx.destination);

      function release() {
        active = false;
        try { node.disconnect(); source.disconnect(); } catch (e) { /* уже отключено */ }
        stream.getTracks().forEach(function (t) { t.stop(); });
        try { ctx.close(); } catch (e) { /* уже закрыт */ }
      }

      return {
        stop: function () {
          var rate = ctx.sampleRate;
          release();
          var samples = downsample(merge(chunks), rate, TARGET_RATE);
          return {
            wav: encodeWav(samples, Math.min(rate, TARGET_RATE)), seconds: samples.length / TARGET_RATE,
            onsetMs: onsetAt ? onsetAt - begun : null, speechMs: onsetAt ? lastVoiceAt - onsetAt : 0
          };
        },
        cancel: release
      };
    }, function () {
      throw new Error('Нет доступа к микрофону. Разреши его в настройках браузера и попробуй снова.');
    });
  }

  // ---------- Озвучка реплик клиента ----------
  function canSpeak() {
    return !!(window.speechSynthesis && window.SpeechSynthesisUtterance);
  }

  // Клиенты в основном мужчины: берём мужской русский голос. Известные женские имена исключаем.
  var FEMALE_RE = /milena|milena|katya|irina|anna|tatyana|svetlana|alena|elena|olga|female|жен|милена|катя|ирина|анна|татьяна|светлана|алёна|елена|ольга|google/i;
  var MALE_RE = /yuri|юрий|pavel|павел|dmitri|дмитрий|maxim|максим|male|муж|nikolai|николай|aleksandr|александр|ivan|иван/i;

  function ruVoices() {
    if (!canSpeak()) return [];
    return (window.speechSynthesis.getVoices() || []).filter(function (v) { return /^ru/i.test(v.lang); });
  }

  // Подбор голоса: выбранный вручную, затем мужской по имени, затем любой не женский
  function pickVoice(name) {
    var list = ruVoices();
    var chosen = name ? list.filter(function (v) { return v.name === name; })[0] : null;
    if (chosen) return chosen;
    var male = list.filter(function (v) { return MALE_RE.test(v.name) && !/female/i.test(v.name); })[0];
    if (male) return male;
    return list.filter(function (v) { return !FEMALE_RE.test(v.name); })[0] || list[0] || null;
  }

  function isMale(voice) {
    return !!voice && MALE_RE.test(voice.name) && !/female/i.test(voice.name);
  }

  // Если мужского голоса в системе нет, понижаем тон женского, чтобы звучало ближе к мужскому
  function speak(text, voiceName) {
    return new Promise(function (resolve) {
      if (!canSpeak()) { resolve(); return; }
      try {
        window.speechSynthesis.cancel();
        var u = new window.SpeechSynthesisUtterance(text);
        u.lang = 'ru-RU';
        u.rate = 1.05;
        var v = pickVoice(voiceName);
        if (v) u.voice = v;
        u.pitch = isMale(v) ? 0.95 : 0.6;
        u.onend = function () { resolve(); };
        u.onerror = function () { resolve(); };
        window.speechSynthesis.speak(u);
      } catch (e) {
        resolve();
      }
    });
  }

  function stopSpeaking() {
    if (canSpeak()) {
      try { window.speechSynthesis.cancel(); } catch (e) { /* нечего останавливать */ }
    }
  }

  C.voice = {
    supported: supported, start: start, speak: speak, ruVoices: ruVoices, pickVoice: pickVoice, isMale: isMale, stopSpeaking: stopSpeaking, canSpeak: canSpeak,
    downsample: downsample, encodeWav: encodeWav, MAX_SECONDS: MAX_SECONDS
  };
})((window.CRM = window.CRM || {}));
