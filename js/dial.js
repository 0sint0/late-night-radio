/* =============================================================
   dial.js  –  Frequency state, knob input, needle, readout.
   Slice 1: drag, wheel, keyboard.  Slice 2 adds station snapping.
================================================================ */

var Dial = (function () {

  var FREQ_MIN   = 88.0;
  var FREQ_MAX   = 108.0;
  var FREQ_RANGE = FREQ_MAX - FREQ_MIN;   // 20.0

  /* px of vertical drag to traverse the full 20 MHz range */
  var PX_FOR_FULL_RANGE = 300;
  var STEP_SMALL        = 0.1;   // arrow key step
  var STEP_LARGE        = 0.5;   // shift + arrow key step

  /* State */
  var frequency  = 88.0;
  var dragging   = false;
  var dragStartY = 0;
  var dragStartF = 0;   // frequency at drag start
  var moveTimer  = null;

  /* DOM refs – set in init() */
  var knobEl      = null;
  var needleEl    = null;
  var readoutEl   = null;
  var dialAreaEl  = null;

  /* External callback (wired by main.js) */
  var onFreqChange = null;

  /* ── helpers ──────────────────────────────────────────── */

  function clamp(v, lo, hi) {
    return Math.max(lo, Math.min(hi, v));
  }

  function round1(v) {
    return Math.round(v * 10) / 10;
  }

  /** Convert frequency → needle position as % across the dial scale. */
  function freqToPercent(f) {
    return (f - FREQ_MIN) / FREQ_RANGE * 100;
  }

  /** knob rotation: 0° at 88.0 MHz, 360° at 108.0 MHz */
  function freqToAngle(f) {
    return (f - FREQ_MIN) / FREQ_RANGE * 360;
  }

  function applyFrequency(f, sweeping) {
    frequency = round1(clamp(f, FREQ_MIN, FREQ_MAX));

    /* Knob rotation */
    if (knobEl) {
      knobEl.style.transform = 'rotate(' + freqToAngle(frequency) + 'deg)';
      knobEl.setAttribute('aria-valuenow',  String(Math.round(frequency * 10)));
      knobEl.setAttribute('aria-valuetext', frequency.toFixed(1) + ' MHz');
    }

    /* Needle position */
    if (needleEl) {
      needleEl.style.left = freqToPercent(frequency) + '%';
    }

    /* Digital readout */
    if (readoutEl) {
      readoutEl.textContent = frequency.toFixed(1);
    }

    /* Notify audio and any other listeners */
    if (typeof onFreqChange === 'function') {
      onFreqChange(frequency, sweeping);
    }

    /* Fire a "settled" callback shortly after movement stops */
    if (sweeping) {
      if (moveTimer) clearTimeout(moveTimer);
      moveTimer = setTimeout(function () {
        if (typeof onFreqChange === 'function') {
          onFreqChange(frequency, false);
        }
      }, 150);
    }
  }

  /* ── drag (mouse & touch) ─────────────────────────────── */

  function startDrag(clientY) {
    dragging   = true;
    dragStartY = clientY;
    dragStartF = frequency;
    document.body.style.userSelect       = 'none';
    document.body.style.webkitUserSelect = 'none';
  }

  function moveDrag(clientY) {
    if (!dragging) return;
    /* Upward drag → higher frequency */
    var deltaY    = dragStartY - clientY;
    var deltaFreq = (deltaY / PX_FOR_FULL_RANGE) * FREQ_RANGE;
    applyFrequency(dragStartF + deltaFreq, true);
  }

  function endDrag() {
    if (!dragging) return;
    dragging = false;
    document.body.style.userSelect       = '';
    document.body.style.webkitUserSelect = '';
  }

  /* ── wheel ────────────────────────────────────────────── */

  function onWheel(e) {
    e.preventDefault();
    var raw = e.deltaY;
    if (e.deltaMode === 1) raw *= 16;
    if (e.deltaMode === 2) raw *= 400;
    var delta = -(raw / PX_FOR_FULL_RANGE) * FREQ_RANGE;
    applyFrequency(frequency + delta, true);
  }

  /* ── keyboard ─────────────────────────────────────────── */

  function onKeyDown(e) {
    var step = 0;
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
      step = e.shiftKey ? STEP_LARGE : STEP_SMALL;
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
      step = e.shiftKey ? -STEP_LARGE : -STEP_SMALL;
    }
    if (step !== 0) {
      e.preventDefault();
      applyFrequency(frequency + step, true);
    }
  }

  /* ── public ───────────────────────────────────────────── */

  function init(els, freqChangeCb) {
    knobEl     = els.knob;
    needleEl   = els.needle;
    readoutEl  = els.readout;
    dialAreaEl = els.dialArea;
    onFreqChange = freqChangeCb;

    /* Mouse drag on knob */
    knobEl.addEventListener('mousedown', function (e) {
      e.preventDefault();
      startDrag(e.clientY);
    });
    document.addEventListener('mousemove', function (e) {
      moveDrag(e.clientY);
    });
    document.addEventListener('mouseup', endDrag);

    /* Touch drag on knob */
    knobEl.addEventListener('touchstart', function (e) {
      e.preventDefault();
      startDrag(e.touches[0].clientY);
    }, { passive: false });
    document.addEventListener('touchmove', function (e) {
      if (dragging) {
        e.preventDefault();
        moveDrag(e.touches[0].clientY);
      }
    }, { passive: false });
    document.addEventListener('touchend', endDrag);

    /* Wheel over the whole dial area */
    dialAreaEl.addEventListener('wheel', onWheel, { passive: false });

    /* Keyboard on the knob (focusable via tabindex in HTML) */
    knobEl.addEventListener('keydown', onKeyDown);

    /* Set initial state */
    applyFrequency(frequency, false);
  }

  function getFrequency() { return frequency; }
  function setFrequency(f) { applyFrequency(f, false); }

  return {
    init        : init,
    getFrequency: getFrequency,
    setFrequency: setFrequency
  };

}());
