(function (C) {
  'use strict';

  var TARGET_RATE = 16000;
  var CHUNK_SOFT = 90;     // после стольких секунд режем на ближайшей паузе
  var CHUNK_HARD = 140;    // и не позже стольких секунд: запись должна влезть в запрос к серверу
  var QUIET = 0.02;

  function ctxClass() {
    return window.AudioContext || window.webkitAudioContext;
  }

  function supported() {
    return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia && ctxClass());
  }

  function merge(chunks) {
    var total = chunks.reduce(function (n, c) { return n + c.length; }, 0);
    var out = new Float32Array(total);
    var offset = 0;
    chunks.forEach(function (c) { out.set(c, offset); offset += c.length; });
    return out;
  }

  // Запись для длинных разговоров: звук режется на куски по полторы-две минуты, каждый кусок сразу уходит на расшифровку.
  // opts: tab (добавить звук вкладки или экрана), onChunk(wav, seconds), onLevel(0..1).
  function start(opts) {
    opts = opts || {};
    if (!supported()) return Promise.reject(new Error('Браузер не умеет записывать звук. Открой приложение в Chrome или Safari.'));

    var streams = [];
    function stopAll() { streams.forEach(function (s) { s.getTracks().forEach(function (t) { t.stop(); }); }); }

    function getTab() {
      if (!opts.tab) return Promise.resolve(null);
      if (!navigator.mediaDevices.getDisplayMedia) return Promise.reject(new Error('Браузер не умеет записывать звук вкладки. Отключи эту галочку или открой Chrome.'));
      return navigator.mediaDevices.getDisplayMedia({ video: true, audio: true }).then(function (stream) {
        streams.push(stream);
        if (!stream.getAudioTracks().length) {
          stopAll();
          throw new Error('Звук вкладки не передан. В окне выбора отметь «Поделиться звуком вкладки».');
        }
        stream.getVideoTracks().forEach(function (t) { t.stop(); });
        return stream;
      });
    }

    return navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true } }).then(function (mic) {
      streams.push(mic);
      return getTab().then(function (tab) {
        var Ctx = ctxClass();
        var ctx = new Ctx();
        var mix = ctx.createGain();
        ctx.createMediaStreamSource(mic).connect(mix);
        if (tab) ctx.createMediaStreamSource(new MediaStream(tab.getAudioTracks())).connect(mix);
        var node = ctx.createScriptProcessor(4096, 1, 1);
        var rate = ctx.sampleRate;
        var pieces = [];
        var piece = 0;
        var seconds = 0;
        var active = true;
        var index = 0;

        function flush() {
          if (!pieces.length) return;
          var samples = C.voice.downsample(merge(pieces), rate, TARGET_RATE);
          pieces = [];
          piece = 0;
          if (samples.length < TARGET_RATE) return;   // меньше секунды не отправляем
          index += 1;
          if (opts.onChunk) opts.onChunk(C.voice.encodeWav(samples, Math.min(rate, TARGET_RATE)), samples.length / TARGET_RATE, index);
        }

        node.onaudioprocess = function (e) {
          if (!active) return;
          var data = new Float32Array(e.inputBuffer.getChannelData(0));
          pieces.push(data);
          piece += data.length;
          seconds += data.length / rate;
          var sum = 0;
          for (var i = 0; i < data.length; i++) sum += data[i] * data[i];
          var level = Math.min(1, Math.sqrt(sum / data.length) * 6);
          if (opts.onLevel) opts.onLevel(level);
          var len = piece / rate;
          if (len >= CHUNK_HARD || (len >= CHUNK_SOFT && level < QUIET)) flush();
        };
        mix.connect(node);
        node.connect(ctx.destination);

        return {
          seconds: function () { return seconds; },
          stop: function () {
            active = false;
            flush();
            try { node.disconnect(); mix.disconnect(); } catch (err) { /* уже отключено */ }
            stopAll();
            try { ctx.close(); } catch (err) { /* уже закрыт */ }
            return { seconds: seconds, chunks: index };
          },
          cancel: function () {
            active = false;
            try { node.disconnect(); mix.disconnect(); } catch (err) { /* уже отключено */ }
            stopAll();
            try { ctx.close(); } catch (err) { /* уже закрыт */ }
          }
        };
      });
    }, function () {
      stopAll();
      throw new Error('Нет доступа к микрофону. Разреши его в настройках браузера и попробуй снова.');
    });
  }

  // Файл записи (m4a, mp3, wav, webm) в куски WAV 16 кГц для расшифровки
  function decodeFile(file, chunkSec) {
    chunkSec = chunkSec || 120;
    var Ctx = ctxClass();
    if (!Ctx) return Promise.reject(new Error('Браузер не умеет читать аудио. Открой приложение в Chrome или Safari.'));
    return file.arrayBuffer().then(function (buf) {
      var ctx;
      try { ctx = new Ctx({ sampleRate: TARGET_RATE }); } catch (e) { ctx = new Ctx(); }
      return new Promise(function (resolve, reject) {
        ctx.decodeAudioData(buf, resolve, function () { reject(new Error('Не удалось прочитать файл. Попробуй m4a, mp3 или wav.')); });
      }).then(function (audio) {
        var ch = audio.numberOfChannels;
        var length = audio.length;
        var mono = new Float32Array(length);
        for (var c = 0; c < ch; c++) {
          var data = audio.getChannelData(c);
          for (var i = 0; i < length; i++) mono[i] += data[i] / ch;
        }
        var samples = C.voice.downsample(mono, audio.sampleRate, TARGET_RATE);
        try { ctx.close(); } catch (e) { /* уже закрыт */ }
        var step = chunkSec * TARGET_RATE;
        var out = [];
        for (var from = 0; from < samples.length; from += step) {
          var part = samples.subarray(from, Math.min(samples.length, from + step));
          if (part.length >= TARGET_RATE) out.push(C.voice.encodeWav(part, TARGET_RATE));
        }
        return { chunks: out, seconds: samples.length / TARGET_RATE };
      });
    });
  }

  C.recorder = { supported: supported, start: start, decodeFile: decodeFile };
})((window.CRM = window.CRM || {}));
