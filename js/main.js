/* =============================================================
   main.js  –  Power-on, wiring, UI controls.
   Slice 1: AudioContext creation, dial ↔ audio bridge,
            volume slider, mute button, static canvas, dial ticks.
   Slices 2-6 will extend window.LNR for station management.
================================================================ */

(function () {

  /* ── Build dial tick marks ────────────────────────────── */

  function buildDialTicks() {
    var container = document.getElementById('dial-ticks');
    if (!container) return;

    var FREQ_MIN  = 88.0;
    var FREQ_MAX  = 108.0;
    var FREQ_RANGE = FREQ_MAX - FREQ_MIN;

    /* Major ticks every 2 MHz labelled, minor ticks every 0.5 MHz */
    var tickData = [];
    for (var f = FREQ_MIN; f <= FREQ_MAX + 0.001; f = Math.round((f + 0.5) * 10) / 10) {
      var isMajor = Math.round(f * 10) % 20 === 0;   // every 2 MHz
      tickData.push({ freq: f, major: isMajor });
    }

    tickData.forEach(function (t) {
      var pct  = (t.freq - FREQ_MIN) / FREQ_RANGE * 100;
      var wrap = document.createElement('div');
      wrap.className   = 'tick-wrap';
      wrap.style.left  = pct + '%';

      if (t.major) {
        var label = document.createElement('span');
        label.className   = 'tick-label';
        label.textContent = t.freq % 1 === 0
          ? t.freq.toFixed(0)
          : t.freq.toFixed(1);
        wrap.appendChild(label);
      }

      var line = document.createElement('div');
      line.className = 'tick-line ' + (t.major ? 'major' : 'minor');
      wrap.appendChild(line);

      container.appendChild(wrap);
    });
  }

  /* ── Canvas static animation ─────────────────────────── */
  var canvas, canvasCtx, animFrame;
  var reducedMotion = window.matchMedia &&
                      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function initCanvas() {
    canvas    = document.getElementById('static-canvas');
    if (!canvas) return;
    canvasCtx = canvas.getContext('2d');
    resizeCanvas();
    window.addEventListener('resize', function () {
      resizeCanvas();
      if (reducedMotion) drawStaticSubtle();
    });
    if (!reducedMotion) {
      drawStatic();
    } else {
      drawStaticSubtle();
    }
  }

  function resizeCanvas() {
    if (!canvas) return;
    var parent = canvas.parentElement;
    canvas.width  = parent.offsetWidth  || 1;
    canvas.height = parent.offsetHeight || 1;
  }

  function drawStatic() {
    if (!canvas || !canvasCtx) return;
    var w = canvas.width, h = canvas.height;
    if (w < 1 || h < 1) { animFrame = requestAnimationFrame(drawStatic); return; }
    var imageData = canvasCtx.createImageData(w, h);
    var data      = imageData.data;
    for (var i = 0; i < data.length; i += 4) {
      var v = (Math.random() * 60) | 0;
      data[i]     = v;
      data[i + 1] = v;
      data[i + 2] = v;
      data[i + 3] = Math.random() > 0.55 ? ((Math.random() * 80) | 0) : 0;
    }
    canvasCtx.putImageData(imageData, 0, 0);
    animFrame = requestAnimationFrame(drawStatic);
  }

  function drawStaticSubtle() {
    if (!canvas || !canvasCtx) return;
    var w = canvas.width, h = canvas.height;
    if (w < 1 || h < 1) return;
    var imageData = canvasCtx.createImageData(w, h);
    var data      = imageData.data;
    for (var i = 0; i < data.length; i += 4) {
      var v = (Math.random() * 30) | 0;
      data[i]     = v;
      data[i + 1] = v;
      data[i + 2] = v;
      data[i + 3] = Math.random() > 0.7 ? 30 : 0;
    }
    canvasCtx.putImageData(imageData, 0, 0);
  }

  /* ── Power-on ─────────────────────────────────────────── */

  function powerOn() {
    var err         = document.getElementById('audio-error');
    var powerScreen = document.getElementById('power-screen');
    var radio       = document.getElementById('radio-wrapper');

    var ok = AudioEngine.init();
    if (!ok && err) { err.hidden = false; }

    if (powerScreen) powerScreen.hidden = true;
    if (radio)       radio.hidden       = false;

    /* Build scale ticks now that the dial is in the DOM */
    buildDialTicks();

    /* Kick off canvas noise */
    initCanvas();

    /* Wire the dial */
    Dial.init(
      {
        knob    : document.getElementById('knob'),
        needle  : document.getElementById('needle'),
        readout : document.getElementById('freq-readout'),
        dialArea: document.getElementById('dial-area')
      },
      function onFreqChange(freq, sweeping) {
        AudioEngine.onDialMove(sweeping);
        /* Slice 2 will add station detection here */
      }
    );

    /* Volume slider */
    var volSlider = document.getElementById('vol-slider');
    if (volSlider) {
      volSlider.addEventListener('input', function () {
        AudioEngine.setVolume(parseFloat(this.value));
      });
    }

    /* Mute button */
    var muteBtn = document.getElementById('mute-btn');
    if (muteBtn) {
      muteBtn.addEventListener('click', function () {
        var nowMuted = AudioEngine.toggleMute();
        muteBtn.textContent = nowMuted ? '🔇' : '🔊';
        muteBtn.setAttribute('aria-label',   nowMuted ? 'Unmute' : 'Mute');
        muteBtn.setAttribute('aria-pressed', String(nowMuted));
      });
    }
  }

  /* ── Boot ─────────────────────────────────────────────── */

  document.addEventListener('DOMContentLoaded', function () {
    var btn = document.getElementById('power-btn');
    if (btn) btn.addEventListener('click', powerOn);
  });

  /* Expose namespace for later slices */
  window.LNR = {
    AudioEngine: AudioEngine,
    Dial       : Dial,
    Stations   : STATIONS
  };

}());

