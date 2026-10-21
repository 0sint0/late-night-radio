/* =============================================================
   main.js  â€“  Power-on, wiring, UI controls.
   Slice 1: AudioContext creation, dial bridge, volume, canvas, ticks.
   Slice 2: Station detection, signal meter, lock lamp, found-list.
   Slices 3-6 will extend window.LNR further.
================================================================ */

(function () {

  /* â”€â”€ Slice 2 state â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
  var foundStations = {};   // id -> station  (in-memory; Slice 5 saves)
  var lockTimer     = null;
  var lockedStation = null;
  var LOCK_HOLD_MS  = 1000;

  /* â”€â”€ Build dial tick marks (Slice 1, unchanged) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */

  function buildDialTicks() {
    var container = document.getElementById('dial-ticks');
    if (!container) return;
    var FREQ_MIN   = 88.0;
    var FREQ_MAX   = 108.0;
    var FREQ_RANGE = FREQ_MAX - FREQ_MIN;
    var tickData   = [];
    for (var f = FREQ_MIN; f <= FREQ_MAX + 0.001; f = Math.round((f + 0.5) * 10) / 10) {
      var isMajor = Math.round(f * 10) % 20 === 0;
      tickData.push({ freq: f, major: isMajor });
    }
    tickData.forEach(function (t) {
      var pct  = (t.freq - FREQ_MIN) / FREQ_RANGE * 100;
      var wrap = document.createElement('div');
      wrap.className  = 'tick-wrap';
      wrap.style.left = pct + '%';
      if (t.major) {
        var label = document.createElement('span');
        label.className   = 'tick-label';
        label.textContent = t.freq % 1 === 0 ? t.freq.toFixed(0) : t.freq.toFixed(1);
        wrap.appendChild(label);
      }
      var line = document.createElement('div');
      line.className = 'tick-line ' + (t.major ? 'major' : 'minor');
      wrap.appendChild(line);
      container.appendChild(wrap);
    });
  }

  /* â”€â”€ Canvas static (Slice 1, unchanged) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
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
    if (!reducedMotion) { drawStatic(); } else { drawStaticSubtle(); }
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
      data[i] = v; data[i+1] = v; data[i+2] = v;
      data[i+3] = Math.random() > 0.55 ? ((Math.random() * 80) | 0) : 0;
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
      data[i] = v; data[i+1] = v; data[i+2] = v;
      data[i+3] = Math.random() > 0.7 ? 30 : 0;
    }
    canvasCtx.putImageData(imageData, 0, 0);
  }

  /* â”€â”€ Slice 2: station UI helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */

  function updateSignalMeter(strength) {
    var segs = document.querySelectorAll('.sig-seg');
    var lit  = Math.round(strength * segs.length);
    segs.forEach(function (seg, i) {
      seg.classList.toggle('sig-seg--on', i < lit);
    });
  }

  function updateStationPanel(station, strength, locked) {
    var panel  = document.getElementById('station-panel');
    var nameEl = document.getElementById('station-name');
    var typeEl = document.getElementById('station-type');
    var lampEl = document.getElementById('lock-lamp');
    if (!panel) return;
    if (station && strength > 0.05) {
      panel.classList.add('station-panel--visible');
      nameEl.textContent = station.name;
      typeEl.textContent = station.type;
      typeEl.className   = 'station-type station-type--' + station.type;
      lampEl.classList.toggle('lock-lamp--on', !!locked);
      lampEl.setAttribute('aria-label', locked ? 'Station locked' : 'Tuning\u2026');
    } else {
      panel.classList.remove('station-panel--visible');
      lampEl.classList.remove('lock-lamp--on');
    }
  }

  function markFound(station) {
    if (foundStations[station.id]) return;
    foundStations[station.id] = station;
    var lamp = document.getElementById('lock-lamp');
    if (lamp) {
      lamp.classList.add('lock-lamp--flash');
      setTimeout(function () { lamp.classList.remove('lock-lamp--flash'); }, 600);
    }
    console.info('LNR: locked "' + station.name + '" @ ' + station.frequency + ' MHz');
  }

  /* â”€â”€ Slice 2: frequency-change handler â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */

  function onFreqChange(freq, sweeping) {
    AudioEngine.onDialMove(sweeping);

    var result   = getSignalStrength(freq);
    var station  = result.station;
    var strength = result.strength;

    AudioEngine.setStationStrength(station, strength);
    updateSignalMeter(strength);

    var isLocked = lockedStation && station && lockedStation.id === station.id;
    updateStationPanel(station, strength, isLocked);

    if (station && Math.abs(freq - station.frequency) <= LOCK_THRESHOLD) {
      if (!lockedStation || lockedStation.id !== station.id) {
        if (lockTimer) clearTimeout(lockTimer);
        lockTimer = setTimeout(function () {
          lockedStation = station;
          markFound(station);
          updateStationPanel(station, getSignalStrength(Dial.getFrequency()).strength, true);
        }, LOCK_HOLD_MS);
      }
    } else {
      if (lockTimer) { clearTimeout(lockTimer); lockTimer = null; }
      if (lockedStation && !(station && lockedStation.id === station.id)) {
        lockedStation = null;
        updateStationPanel(station, strength, false);
      }
    }
  }

  /* â”€â”€ Power-on â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */

  function powerOn() {
    var err         = document.getElementById('audio-error');
    var powerScreen = document.getElementById('power-screen');
    var radio       = document.getElementById('radio-wrapper');
    var ok = AudioEngine.init();
    if (!ok && err) { err.hidden = false; }
    if (powerScreen) powerScreen.hidden = true;
    if (radio)       radio.hidden       = false;
    buildDialTicks();
    initCanvas();
    Dial.init(
      {
        knob    : document.getElementById('knob'),
        needle  : document.getElementById('needle'),
        readout : document.getElementById('freq-readout'),
        dialArea: document.getElementById('dial-area')
      },
      onFreqChange
    );
    var volSlider = document.getElementById('vol-slider');
    if (volSlider) {
      volSlider.addEventListener('input', function () {
        AudioEngine.setVolume(parseFloat(this.value));
      });
    }
    var muteBtn = document.getElementById('mute-btn');
    if (muteBtn) {
      muteBtn.addEventListener('click', function () {
        var nowMuted = AudioEngine.toggleMute();
        muteBtn.textContent = nowMuted ? 'ðŸ”‡' : 'ðŸ”Š';
        muteBtn.setAttribute('aria-label',   nowMuted ? 'Unmute' : 'Mute');
        muteBtn.setAttribute('aria-pressed', String(nowMuted));
      });
    }
  }

  /* â”€â”€ Boot â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */

  document.addEventListener('DOMContentLoaded', function () {
    var btn = document.getElementById('power-btn');
    if (btn) btn.addEventListener('click', powerOn);
  });

  window.LNR = {
    AudioEngine     : AudioEngine,
    Dial            : Dial,
    Stations        : STATIONS,
    getFoundStations: function () { return foundStations; }
  };

}());
