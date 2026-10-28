/* =============================================================
   settings.js  --  Sound settings: storage, dialog, visibility.
   Slice 6.  Loaded before main.js.
   Key: "late-night-radio-settings-v1"
================================================================ */

var Settings = (function () {

  var KEY = 'late-night-radio-settings-v1';

  var DEFAULTS = { volume: 0.8, staticLevel: 1.0, morseSpeed: 'slow', muted: false };
  var current  = { volume: 0.8, staticLevel: 1.0, morseSpeed: 'slow', muted: false };
  var MORSE_UNIT_MS = { slow: 300, normal: 180, fast: 120 };

  /* -- localStorage ----------------------------------------- */
  var storageOk = (function () {
    try { localStorage.setItem('__lnrs__','1'); localStorage.removeItem('__lnrs__'); return true; }
    catch (e) { return false; }
  }());

  function loadSaved() {
    if (!storageOk) return;
    try {
      var raw = localStorage.getItem(KEY);
      if (!raw) return;
      var p = JSON.parse(raw);
      if (!p || typeof p !== 'object' || Array.isArray(p)) return;
      if (typeof p.volume === 'number' && p.volume >= 0 && p.volume <= 1)
        current.volume = p.volume;
      if (typeof p.staticLevel === 'number' && p.staticLevel >= 0 && p.staticLevel <= 1)
        current.staticLevel = p.staticLevel;
      if (p.morseSpeed === 'slow' || p.morseSpeed === 'normal' || p.morseSpeed === 'fast')
        current.morseSpeed = p.morseSpeed;
      if (typeof p.muted === 'boolean') current.muted = p.muted;
    } catch (e) {}
  }

  function saveCurrent() {
    if (!storageOk) return;
    try { localStorage.setItem(KEY, JSON.stringify(current)); } catch (e) {}
  }

  /* -- dialog helpers --------------------------------------- */
  var _openBtnEl = null;

  function openSettings() {
    var d = document.getElementById('settings-dialog');
    if (!d) return;
    syncDialogToState();
    d.hidden = false;
    document.body.style.overflow = 'hidden';
    var closeBtn = d.querySelector('.st-close-btn');
    if (closeBtn) setTimeout(function () { closeBtn.focus(); }, 10);
  }

  function closeSettings() {
    var d = document.getElementById('settings-dialog');
    if (!d) return;
    d.hidden = true;
    document.body.style.overflow = '';
    if (_openBtnEl) _openBtnEl.focus();
  }

  function trapFocus(dlg, e) {
    if (e.key !== 'Tab') return;
    var focusable = Array.prototype.slice.call(
      dlg.querySelectorAll('button:not([disabled]),input:not([disabled]),[tabindex]:not([tabindex="-1"])')
    ).filter(function (n) { return n.offsetParent !== null; });
    if (!focusable.length) return;
    var first = focusable[0], last = focusable[focusable.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }

  /* -- apply to engine ------------------------------------- */
  function applyToEngine() {
    if (typeof AudioEngine === 'undefined' || !AudioEngine.isReady()) return;
    AudioEngine.setVolume(current.volume);
    AudioEngine.setStaticLevel(current.staticLevel, 0.3);
    AudioEngine.setMorseUnitMs(MORSE_UNIT_MS[current.morseSpeed] || 300);
    var engineMuted = AudioEngine.isMuted();
    if (current.muted && !engineMuted) AudioEngine.toggleMute();
    if (!current.muted && engineMuted)  AudioEngine.toggleMute();
  }

  function syncDialogToState() {
    var d = document.getElementById('settings-dialog');
    if (!d) return;
    var vs = d.querySelector('#st-vol');
    if (vs) vs.value = String(current.volume);
    var ss = d.querySelector('#st-static');
    if (ss) ss.value = String(current.staticLevel);
    var mb = d.querySelector('#st-mute-btn');
    if (mb) { mb.textContent = current.muted ? 'Unmute' : 'Mute'; mb.setAttribute('aria-pressed', String(current.muted)); }
    d.querySelectorAll('.st-speed-btn').forEach(function (b) {
      var act = b.getAttribute('data-speed') === current.morseSpeed;
      b.classList.toggle('st-speed-btn--active', act);
      b.setAttribute('aria-pressed', String(act));
    });
  }

  function syncOuterMuteBtn() {
    var btn = document.getElementById('mute-btn');
    if (!btn) return;
    btn.textContent = current.muted ? '\uD83D\uDD07' : '\uD83D\uDD0A';
    btn.setAttribute('aria-label',   current.muted ? 'Unmute' : 'Mute');
    btn.setAttribute('aria-pressed', String(current.muted));
  }

  function syncMorseSpeedBtns(speed) {
    document.querySelectorAll('.morse-speed-btn').forEach(function (b) {
      var act = b.getAttribute('data-speed') === speed;
      b.classList.toggle('morse-speed-btn--active', act);
      b.setAttribute('aria-pressed', String(act));
    });
  }

  /* -- init ------------------------------------------------- */
  function init() {
    loadSaved();

    var openBtn = document.getElementById('settings-btn');
    if (openBtn) { _openBtnEl = openBtn; openBtn.addEventListener('click', openSettings); }

    var d = document.getElementById('settings-dialog');
    if (!d) return;

    var closeBtn = d.querySelector('.st-close-btn');
    if (closeBtn) closeBtn.addEventListener('click', closeSettings);
    d.addEventListener('click', function (e) { if (e.target === d) closeSettings(); });
    d.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { e.stopPropagation(); closeSettings(); }
      else trapFocus(d, e);
    });

    var volSlider = d.querySelector('#st-vol');
    if (volSlider) {
      volSlider.addEventListener('input', function () {
        current.volume = parseFloat(this.value);
        saveCurrent();
        if (typeof AudioEngine !== 'undefined') AudioEngine.setVolume(current.volume);
        var outer = document.getElementById('vol-slider');
        if (outer) outer.value = String(current.volume);
      });
    }

    var staticSlider = d.querySelector('#st-static');
    if (staticSlider) {
      staticSlider.addEventListener('input', function () {
        current.staticLevel = parseFloat(this.value);
        saveCurrent();
        if (typeof AudioEngine !== 'undefined') AudioEngine.setStaticLevel(current.staticLevel, 0.15);
      });
    }

    var muteBtn = d.querySelector('#st-mute-btn');
    if (muteBtn) {
      muteBtn.addEventListener('click', function () {
        if (typeof AudioEngine !== 'undefined') { current.muted = AudioEngine.toggleMute(); }
        else { current.muted = !current.muted; }
        saveCurrent();
        syncDialogToState();
        syncOuterMuteBtn();
      });
    }

    d.querySelectorAll('.st-speed-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var speed = btn.getAttribute('data-speed');
        if (!MORSE_UNIT_MS[speed]) return;
        current.morseSpeed = speed;
        saveCurrent();
        if (typeof AudioEngine !== 'undefined') AudioEngine.setMorseUnitMs(MORSE_UNIT_MS[speed]);
        syncMorseSpeedBtns(speed);
        syncDialogToState();
      });
    });
  }

  /* -- page-visibility fade --------------------------------- */
  function initVisibility() {
    if (typeof document.hidden === 'undefined') return;
    document.addEventListener('visibilitychange', function () {
      if (typeof AudioEngine === 'undefined' || !AudioEngine.isReady()) return;
      if (document.hidden) {
        var mg = (typeof AudioEngine.getMasterGain === 'function') ? AudioEngine.getMasterGain() : null;
        var actx = (typeof AudioEngine.getContext  === 'function') ? AudioEngine.getContext()    : null;
        if (mg && actx) {
          var now = actx.currentTime;
          mg.gain.cancelScheduledValues(now);
          mg.gain.setValueAtTime(mg.gain.value, now);
          mg.gain.linearRampToValueAtTime(0, now + 1.5);
        }
      } else {
        AudioEngine.resume();
        AudioEngine.setVolume(current.volume);
      }
    });
  }

  /* -- resume on any user gesture --------------------------- */
  function initResumeOnInteraction() {
    function tryResume() { if (typeof AudioEngine !== 'undefined') AudioEngine.resume(); }
    ['click','keydown','touchstart'].forEach(function (evt) {
      document.addEventListener(evt, tryResume, { passive: true, capture: true });
    });
  }

  /* -- public API ------------------------------------------- */
  return {
    init                   : init,
    applyToEngine          : applyToEngine,
    get                    : function () { return current; },
    syncOuterMuteBtn       : syncOuterMuteBtn,
    initVisibility         : initVisibility,
    initResumeOnInteraction: initResumeOnInteraction
  };

}());
