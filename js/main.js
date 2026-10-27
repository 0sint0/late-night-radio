/* =============================================================
   main.js  - Power-on, wiring, UI controls.
   Slice 1: AudioContext, dial bridge, volume, canvas, ticks.
   Slice 2: Station detection, signal meter, lock lamp, found-list.
   Slice 3: Morse panel, lamp sync, strip, speed, decoder, chart.
   Slice 4: Story captions, clues, progress, gating, finale.
   Slice 5: Logbook, storage save/restore, reset.
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

  /* Slice 4 state */
  var GATE_STATION_ID    = 'st-08';
  var GATE_FOUND_NEEDED  = 7;       /* all 7 non-gated stations found */
  var GATE_DECODED_NEEDED = 2;      /* st-02 and st-05 decoded */
  var GATE_MORSE_IDS     = ['st-02', 'st-05'];
  var gateOpen           = false;   /* becomes true when gate conditions met */
  var gateNoticeSent     = false;   /* live-region notice fires only once */

  /* Slice 5 state */
  var epilogueSeen = false;

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
    updateCaptionArea(station, locked);
    updateGateMessage(station, strength);
  }

  function markFound(station) {
    if (foundStations[station.id]) return;
    foundStations[station.id] = new Date().toISOString();
    var lamp = document.getElementById('lock-lamp');
    if (lamp) {
      lamp.classList.add('lock-lamp--flash');
      setTimeout(function () { lamp.classList.remove('lock-lamp--flash'); }, 600);
    }
    console.info('LNR: locked ' + station.name + ' @ ' + station.frequency + ' MHz');
    saveProgress();
    onStationFound(station);
  }

  /* Slice 2: frequency-change handler */

  function onFreqChange(freq, sweeping) {
    AudioEngine.onDialMove(sweeping);
    var result   = getSignalStrength(freq);
    var station  = result.station;
    var strength = result.strength;

    /* Slice 4: gate — suppress st-08 until conditions met */
    if (station && station.id === GATE_STATION_ID && !gateOpen) {
      station  = null;
      strength = 0;
    }

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
        onStationDecoded(lockedStation);
      } else {
        showResult(result, 'Not quite \u2014 try again.', 'wrong');
      }
    });

    revealBtn.addEventListener('click', function () {
      if (!lockedStation || lockedStation.type !== 'morse') return;
      var wasNew = !decodedStations[lockedStation.id];
      decodedStations[lockedStation.id] = true;
      showResult(result, 'The message: ' + lockedStation.content, 'revealed');
      revealStation(lockedStation);
      if (wasNew) onStationDecoded(lockedStation);
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
    /* Slice 4: show Morse caption now that it's decoded */
    updateCaptionArea(station, true);
  }

  /* ── Slice 4: Story captions ─────────────────────────── */

  function updateCaptionArea(station, locked) {
    var area = document.getElementById('station-caption-area');
    if (!area) return;
    if (!station || !locked) {
      area.classList.remove('caption-area--visible');
      area.innerHTML = '';
      return;
    }
    var data = (typeof STORY !== 'undefined') ? STORY.getData(station.id) : null;
    if (!data) { area.classList.remove('caption-area--visible'); return; }
    var shouldShow = false;
    if (station.type === 'music' || station.type === 'fragment') {
      shouldShow = !!locked;
    } else if (station.type === 'morse') {
      shouldShow = !!decodedStations[station.id];
    }
    if (!shouldShow) {
      area.classList.remove('caption-area--visible');
      area.innerHTML = '';
      return;
    }
    var html = '<p class="caption-title">' + escHtml(data.title) + '</p>' +
               '<p class="caption-text">'  + escHtml(data.caption) + '</p>' +
               '<p class="caption-clue">'  + escHtml(data.clue)    + '</p>';
    area.innerHTML = html;
    area.classList.add('caption-area--visible');
  }

  function escHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  /* ── Slice 4: Progress counter ───────────────────────── */

  function updateProgress() {
    var el = document.getElementById('progress-counter');
    if (!el) return;
    var found = Object.keys(foundStations).length;
    el.textContent = 'Clues found: ' + found + ' of 8';
    el.setAttribute('aria-label', 'Clues found: ' + found + ' of 8');
  }

  /* ── Slice 4: Gate logic ─────────────────────────────── */

  function checkGate() {
    if (gateOpen) return;
    var foundCount = 0;
    for (var id in foundStations) { if (id !== GATE_STATION_ID) foundCount++; }
    var decodedCount = 0;
    for (var di = 0; di < GATE_MORSE_IDS.length; di++) {
      if (decodedStations[GATE_MORSE_IDS[di]]) decodedCount++;
    }
    if (foundCount >= GATE_FOUND_NEEDED && decodedCount >= GATE_DECODED_NEEDED) {
      gateOpen = true;
      saveProgress();
      if (!gateNoticeSent) { gateNoticeSent = true; showGateNotice(); }
    }
  }

  function showGateNotice() {
    var region = document.getElementById('story-live-region');
    if (region) {
      region.textContent = '';
      setTimeout(function () {
        region.textContent = 'A new signal has appeared at the top of the dial.';
      }, 80);
    }
    var notice = document.getElementById('gate-notice');
    if (notice) {
      notice.textContent = 'A new signal has appeared at the top of the dial.';
      notice.classList.add('gate-notice--visible');
      setTimeout(function () { notice.classList.remove('gate-notice--visible'); }, 7000);
    }
  }

  function updateGateMessage(station, strength) {
    var msg = document.getElementById('gate-static-msg');
    if (!msg) return;
    var dialFreq = (typeof Dial !== 'undefined') ? Dial.getFrequency() : 88.0;
    var rawResult = getSignalStrength(dialFreq);
    var nearGate = rawResult.station && rawResult.station.id === GATE_STATION_ID &&
                   rawResult.strength > 0.3;
    msg.classList.toggle('gate-static-msg--visible', nearGate && !gateOpen);
  }

  function onStationFound(station) {
    updateProgress();
    if (typeof Logbook !== 'undefined') Logbook.refresh();
    if (station.id !== GATE_STATION_ID) checkGate();
  }

  function onStationDecoded(station) {
    updateProgress();
    saveProgress();
    if (typeof Logbook !== 'undefined') Logbook.refresh();
    checkGate();
    if (station.id === GATE_STATION_ID) {
      epilogueSeen = true;
      saveProgress();
      setTimeout(showFinaleDialog, 600);
    }
  }

  /* ── Slice 4: Finale dialog ──────────────────────────── */

  function showFinaleDialog() {
    var dialog = document.getElementById('finale-dialog');
    if (!dialog) return;
    /* Mark epilogue as seen and persist */
    epilogueSeen = true;
    saveProgress();
    if (typeof STORY !== 'undefined') {
      var data    = STORY.getEpilogue();
      var titleEl = dialog.querySelector('.finale-title');
      var bodyEl  = dialog.querySelector('.finale-body');
      if (titleEl) titleEl.textContent = data.title;
      if (bodyEl) {
        bodyEl.innerHTML = '';
        for (var i = 0; i < data.paragraphs.length; i++) {
          var p = document.createElement('p');
          p.className   = 'finale-para';
          p.textContent = data.paragraphs[i];
          bodyEl.appendChild(p);
        }
      }
    }
    var closeBtn = dialog.querySelector('.finale-close-btn');
    openDialog(dialog, closeBtn);
  }

  function initFinaleDialog() {
    var dialog   = document.getElementById('finale-dialog');
    if (!dialog) return;
    var closeBtn = dialog.querySelector('.finale-close-btn');
    if (closeBtn) {
      closeBtn.addEventListener('click', function () { closeDialog(dialog, null); });
    }
    dialog.addEventListener('click', function (e) {
      if (e.target === dialog) closeDialog(dialog, null);
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && !dialog.hidden) { e.stopPropagation(); closeDialog(dialog, null); }
    });
    dialog.addEventListener('keydown', function (e) {
      if (e.key !== 'Tab') return;
      var focusable = Array.prototype.slice.call(
        dialog.querySelectorAll("button, [href], input, select, textarea, [tabindex]:not([tabindex=\"-1\"])")
      );
      if (!focusable.length) return;
      var first = focusable[0]; var last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    });
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

  /* ── Slice 5: save / restore / reset ─────────────────────── */

  function saveProgress() {
    if (typeof Storage === 'undefined') return;
    Storage.save({
      found       : foundStations,
      decoded     : decodedStations,
      gateOpen    : gateOpen,
      epilogueSeen: epilogueSeen
    });
  }

  function restoreFromSave() {
    if (typeof Storage === 'undefined') return;
    var saved = Storage.load();

    /* Restore found stations (keyed by id → ISO date string) */
    for (var id in saved.found) {
      if (!Object.prototype.hasOwnProperty.call(saved.found, id)) continue;
      foundStations[id] = saved.found[id];
    }

    /* Restore decoded stations */
    for (var did in saved.decoded) {
      if (!Object.prototype.hasOwnProperty.call(saved.decoded, did)) continue;
      decodedStations[did] = true;
    }

    /* Restore gate */
    if (saved.gateOpen) {
      gateOpen       = true;
      gateNoticeSent = true;  /* suppress the "new signal" notice on load */
    }

    /* Restore epilogue flag */
    epilogueSeen = saved.epilogueSeen;

    /* Update all UI elements that depend on restored state */
    updateProgress();

    /* Re-show captions for any Morse stations already decoded */
    /* (the caption area only shows if a station is currently locked,
       so we don't need to do anything here — it will be correct the
       next time the user tunes to each station) */
  }

  function resetAll() {
    /* Clear saved data */
    if (typeof Storage !== 'undefined') Storage.clear();

    /* Reset all in-memory state */
    foundStations   = {};
    decodedStations = {};
    gateOpen        = false;
    gateNoticeSent  = false;
    epilogueSeen    = false;
    lockedStation   = null;
    if (lockTimer) { clearTimeout(lockTimer); lockTimer = null; }

    /* Close any open dialogs */
    var finaleDlg = document.getElementById('finale-dialog');
    if (finaleDlg && !finaleDlg.hidden) { finaleDlg.hidden = true; document.body.style.overflow = ''; }

    /* Return dial to 88.0 MHz */
    if (typeof Dial !== 'undefined') Dial.setFrequency(88.0);

    /* Reset UI */
    updateProgress();
    updateStationPanel(null, 0, false);
    updateSignalMeter(0);
    clearMorseStrip();
    var morseResult = document.getElementById('morse-result');
    if (morseResult) { morseResult.textContent = ''; morseResult.className = 'morse-result'; }
    var morseInput = document.getElementById('morse-input');
    if (morseInput) morseInput.value = '';

    /* Clear caption area */
    var captionArea = document.getElementById('station-caption-area');
    if (captionArea) { captionArea.classList.remove('caption-area--visible'); captionArea.innerHTML = ''; }

    /* Refresh logbook (will show all unknown) */
    if (typeof Logbook !== 'undefined') Logbook.refresh();

    console.info('LNR: progress reset');
  }

  function showNoSaveNotice() {
    if (typeof Storage === 'undefined') return;
    if (Storage.storageAvailable) return;
    var notice = document.getElementById('no-save-notice');
    if (notice) notice.hidden = false;
  }

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
    initFinaleDialog();
    /* Slice 5: logbook, restore, no-save notice */
    Logbook.init(function () {
      return {
        found       : foundStations,
        decoded     : decodedStations,
        gateOpen    : gateOpen,
        epilogueSeen: epilogueSeen
      };
    });
    restoreFromSave();
    showNoSaveNotice();
    updateProgress();
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
    getDecodedStations : function () { return decodedStations; },
    /* Slice 5: exposed for logbook and reset */
    resetAll           : resetAll,
    showFinale         : showFinaleDialog,
    getEpilogueSeen    : function () { return epilogueSeen; }
  };

}());

