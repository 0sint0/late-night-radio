/* =============================================================
   main.js  - Power-on, wiring, UI controls.
   Slice 1: AudioContext, dial bridge, volume, canvas, ticks.
   Slice 2: Station detection, signal meter, lock lamp, found-list.
   Slice 3: Morse panel, lamp sync, strip, speed, decoder, chart.
================================================================ */

(function () {

  /* Slice 2 state */
  var foundStations = {};
  var lockTimer     = null;
  var lockedStation = null;
  var LOCK_HOLD_MS  = 1000;

  /* Slice 3 state */
  var morseSpeed      = 'slow';
  var decodedStations = {};
  var MORSE_UNIT_MS   = { slow: 300, normal: 180, fast: 120 };

  /* Build dial tick marks */

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

  /* Canvas static */
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

  /* Slice 2: station UI helpers */

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
    updateMorsePanel(station, strength, locked);
  }

  function markFound(station) {
    if (foundStations[station.id]) return;
    foundStations[station.id] = station;
    var lamp = document.getElementById('lock-lamp');
    if (lamp) {
      lamp.classList.add('lock-lamp--flash');
      setTimeout(function () { lamp.classList.remove('lock-lamp--flash'); }, 600);
    }
    console.info('LNR: locked ' + station.name + ' @ ' + station.frequency + ' MHz');
  }

  /* Slice 2: frequency-change handler */

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

  /* Slice 3: Morse panel */

  function updateMorsePanel(station, strength, locked) {
    var panel   = document.getElementById('morse-panel');
    var decoder = document.getElementById('morse-decoder');
    if (!panel) return;
    var isMorse = station && station.type === 'morse' && strength > 0.05;
    if (isMorse) {
      panel.classList.add('morse-panel--visible');
    } else {
      panel.classList.remove('morse-panel--visible');
      clearMorseStrip();
    }
    if (decoder) {
      var showDecoder = isMorse && locked;
      decoder.classList.toggle('morse-decoder--visible', !!showDecoder);
    }
  }

  /* Slice 3: Morse key callback (called from audio) */

  function onMorseKey(isOn, symbol, units) {
    var lamp = document.getElementById('morse-lamp');
    if (lamp) lamp.classList.toggle('morse-lamp--on', !!isOn);
    if (symbol === 'loop') { clearMorseStrip(); return; }
    if (isOn && symbol) {
      appendMorseStrip(symbol);
    } else if (!isOn && units >= 3) {
      appendMorseStrip(units >= 7 ? ' / ' : ' ');
    }
  }

  var _stripBuffer = '';

  function appendMorseStrip(s) {
    var strip = document.getElementById('morse-strip');
    if (!strip) return;
    _stripBuffer += s;
    if (_stripBuffer.length > 120) _stripBuffer = _stripBuffer.slice(-120);
    strip.textContent = _stripBuffer;
  }

  function clearMorseStrip() {
    _stripBuffer = '';
    var strip = document.getElementById('morse-strip');
    if (strip) strip.textContent = '';
  }

  /* Slice 3: speed control */

  function initMorseSpeed() {
    var btns = document.querySelectorAll('.morse-speed-btn');
    btns.forEach(function (btn) {
      btn.addEventListener('click', function () {
        var speed = btn.getAttribute('data-speed');
        if (!MORSE_UNIT_MS[speed]) return;
        morseSpeed = speed;
        AudioEngine.setMorseUnitMs(MORSE_UNIT_MS[speed]);
        btns.forEach(function (b) {
          var active = b.getAttribute('data-speed') === speed;
          b.classList.toggle('morse-speed-btn--active', active);
          b.setAttribute('aria-pressed', String(active));
        });
      });
    });
  }

  /* Slice 3: decoder */

  function initMorseDecoder() {
    var checkBtn  = document.getElementById('morse-check-btn');
    var revealBtn = document.getElementById('morse-reveal-btn');
    var input     = document.getElementById('morse-input');
    var result    = document.getElementById('morse-result');
    if (!checkBtn || !revealBtn || !input || !result) return;

    checkBtn.addEventListener('click', function () {
      if (!lockedStation || lockedStation.type !== 'morse') return;
      var answer  = normalise(input.value);
      var correct = normalise(lockedStation.content);
      if (!answer) { showResult(result, 'Type what you hear, then check.', ''); return; }
      if (answer === correct) {
        decodedStations[lockedStation.id] = true;
        showResult(result, '\u2713 Correct \u2014 ' + lockedStation.content, 'correct');
        revealStation(lockedStation);
      } else {
        showResult(result, 'Not quite \u2014 try again.', 'wrong');
      }
    });

    revealBtn.addEventListener('click', function () {
      if (!lockedStation || lockedStation.type !== 'morse') return;
      decodedStations[lockedStation.id] = true;
      showResult(result, 'The message: ' + lockedStation.content, 'revealed');
      revealStation(lockedStation);
    });

    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') checkBtn.click();
    });
  }

  function normalise(str) {
    return str.toUpperCase().replace(/[^A-Z0-9 ]/g, '').replace(/\s+/g, ' ').trim();
  }

  function showResult(el, msg, type) {
    el.textContent = msg;
    el.className   = 'morse-result' + (type ? ' morse-result--' + type : '');
  }

  function revealStation(station) {
    var nameEl = document.getElementById('station-name');
    if (nameEl && decodedStations[station.id]) {
      nameEl.title = station.content;
    }
  }

  /* Slice 3: chart dialog */

  function initChartDialog() {
    var openBtn  = document.getElementById('morse-chart-btn');
    var dialog   = document.getElementById('morse-chart-dialog');
    var closeBtn = document.getElementById('morse-chart-close');
    if (!openBtn || !dialog || !closeBtn) return;
    buildChartGrid(dialog);
    openBtn.addEventListener('click', function () { openDialog(dialog, closeBtn); });
    closeBtn.addEventListener('click', function () { closeDialog(dialog, openBtn); });
    dialog.addEventListener('click', function (e) {
      if (e.target === dialog) closeDialog(dialog, openBtn);
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && !dialog.hidden) { e.stopPropagation(); closeDialog(dialog, openBtn); }
    });
    dialog.addEventListener('keydown', function (e) {
      if (e.key !== 'Tab') return;
      var focusable = Array.prototype.slice.call(dialog.querySelectorAll("button, [href], input, select, textarea, [tabindex]:not([tabindex=\"-1\"])"));
      if (!focusable.length) return;
      var first = focusable[0]; var last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    });
  }

  function openDialog(dialog, firstFocus) {
    dialog.hidden = false;
    document.body.style.overflow = 'hidden';
    if (firstFocus) setTimeout(function () { firstFocus.focus(); }, 10);
  }

  function closeDialog(dialog, returnFocus) {
    dialog.hidden = true;
    document.body.style.overflow = '';
    if (returnFocus) returnFocus.focus();
  }

  function buildChartGrid(dialog) {
    var grid = dialog.querySelector('.morse-chart-grid');
    if (!grid || typeof Morse === 'undefined') return;
    var order = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'.split('');
    order.forEach(function (ch) {
      var code = Morse.TABLE[ch];
      if (!code) return;
      var entry  = document.createElement('div');
      entry.className = 'morse-chart-entry';
      var charEl = document.createElement('span');
      charEl.className   = 'morse-chart-char';
      charEl.textContent = ch;
      var codeEl = document.createElement('span');
      codeEl.className   = 'morse-chart-code';
      codeEl.textContent = code;
      entry.appendChild(charEl); entry.appendChild(codeEl);
      grid.appendChild(entry);
    });
  }

  /* Power-on */

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
        muteBtn.textContent = nowMuted ? '\ud83d\udd07' : '\ud83d\udd0a';
        muteBtn.setAttribute('aria-label',   nowMuted ? 'Unmute' : 'Mute');
        muteBtn.setAttribute('aria-pressed', String(nowMuted));
      });
    }
    AudioEngine.setMorseKeyCallback(onMorseKey);
    initMorseSpeed();
    initMorseDecoder();
    initChartDialog();
  }

  /* Boot */

  document.addEventListener('DOMContentLoaded', function () {
    var btn = document.getElementById('power-btn');
    if (btn) btn.addEventListener('click', powerOn);
  });

  window.LNR = {
    AudioEngine        : AudioEngine,
    Dial               : Dial,
    Stations           : STATIONS,
    Morse              : Morse,
    getFoundStations   : function () { return foundStations; },
    getDecodedStations : function () { return decodedStations; }
  };

}());

