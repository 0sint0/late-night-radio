/* =============================================================
   storage.js  —  Persistent save / load for Late Night Radio.
   Slice 5.  Loaded before main.js.

   Exports: window.Storage  (object)

   Public API
   ----------
   Storage.load()           → returns a safe, validated state object
   Storage.save(state)      → serialises state to localStorage
   Storage.clear()          → wipes the localStorage key
   Storage.storageAvailable → boolean; false in private-mode / blocked
   Storage.VERSION          → current schema version string

   State shape saved
   -----------------
   {
     version      : "1",
     found        : { "<id>": <ISO-date-string>, ... },
     decoded      : { "<id>": true, ... },
     gateOpen     : false,
     epilogueSeen : false
   }
================================================================ */

var Storage = (function () {

  var KEY     = 'late-night-radio-v1';
  var VERSION = '1';

  /* ── feature-detect localStorage ──────────────────────────── */

  var storageAvailable = (function () {
    try {
      var probe = '__lnr_probe__';
      localStorage.setItem(probe, '1');
      localStorage.removeItem(probe);
      return true;
    } catch (e) {
      return false;
    }
  }());

  /* ── shape validation helpers ──────────────────────────────── */

  function isObject(v) {
    return v !== null && typeof v === 'object' && !Array.isArray(v);
  }

  function isString(v) {
    return typeof v === 'string';
  }

  /* Return a valid found-map: keys are strings, values are
     ISO-date strings (or we fall back to a sentinel). */
  function validateFound(raw) {
    var out = {};
    if (!isObject(raw)) return out;
    var VALID_IDS = { 'st-01':1,'st-02':1,'st-03':1,'st-04':1,
                      'st-05':1,'st-06':1,'st-07':1,'st-08':1 };
    for (var k in raw) {
      if (!Object.prototype.hasOwnProperty.call(raw, k)) continue;
      if (!VALID_IDS[k]) continue;
      /* accept any string (ISO date) or number (legacy) */
      var v = raw[k];
      out[k] = isString(v) ? v : new Date(0).toISOString();
    }
    return out;
  }

  function validateDecoded(raw) {
    var out = {};
    if (!isObject(raw)) return out;
    var MORSE_IDS = { 'st-02':1,'st-05':1,'st-08':1 };
    for (var k in raw) {
      if (!Object.prototype.hasOwnProperty.call(raw, k)) continue;
      if (!MORSE_IDS[k]) continue;
      if (raw[k] === true) out[k] = true;
    }
    return out;
  }

  /* Return an empty, safe default state. */
  function empty() {
    return {
      version     : VERSION,
      found       : {},
      decoded     : {},
      gateOpen    : false,
      epilogueSeen: false
    };
  }

  /* ── public: load ──────────────────────────────────────────── */

  function load() {
    if (!storageAvailable) return empty();
    try {
      var raw = localStorage.getItem(KEY);
      if (!raw) return empty();
      var parsed = JSON.parse(raw);
      if (!isObject(parsed)) return empty();
      /* version mismatch → discard */
      if (parsed.version !== VERSION) return empty();
      return {
        version     : VERSION,
        found       : validateFound(parsed.found),
        decoded     : validateDecoded(parsed.decoded),
        gateOpen    : parsed.gateOpen    === true,
        epilogueSeen: parsed.epilogueSeen === true
      };
    } catch (e) {
      return empty();
    }
  }

  /* ── public: save ──────────────────────────────────────────── */

  function save(state) {
    if (!storageAvailable) return;
    try {
      /* Only serialise the known keys; never throw to caller. */
      var payload = {
        version     : VERSION,
        found       : isObject(state.found)   ? state.found   : {},
        decoded     : isObject(state.decoded) ? state.decoded : {},
        gateOpen    : state.gateOpen    === true,
        epilogueSeen: state.epilogueSeen === true
      };
      localStorage.setItem(KEY, JSON.stringify(payload));
    } catch (e) {
      /* Storage full or blocked — swallow silently. */
    }
  }

  /* ── public: clear ─────────────────────────────────────────── */

  function clear() {
    if (!storageAvailable) return;
    try {
      localStorage.removeItem(KEY);
    } catch (e) {}
  }

  /* ── public API ────────────────────────────────────────────── */

  return {
    load            : load,
    save            : save,
    clear           : clear,
    storageAvailable: storageAvailable,
    VERSION         : VERSION
  };

}());
