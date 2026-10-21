// js/stations.js — Station data and signal-strength helpers.
// Slice 2: 8 stations defined.  Content is placeholder; real story in Slice 4.
// Adding a station = adding one object to STATIONS.
//
// Types: "music" | "morse" | "fragment"
// Signal radius: full strength at exact frequency, zero at ±0.5 MHz.

var STATIONS = [
  {
    id       : 'st-01',
    frequency: 90.1,
    type     : 'music',
    name     : 'The Lullaby Hour',
    content  : 'A gentle, repeating melody drifts through the speaker grille.'
  },
  {
    id       : 'st-02',
    frequency: 91.7,
    type     : 'morse',
    name     : 'Signal Zero',
    content  : 'SOS SOS WHO IS THERE'
  },
  {
    id       : 'st-03',
    frequency: 93.5,
    type     : 'fragment',
    name     : 'The Hiss',
    content  : 'A looping pattern of tones, almost rhythmic.'
  },
  {
    id       : 'st-04',
    frequency: 96.3,
    type     : 'music',
    name     : 'Carousel',
    content  : 'Three notes, cycling endlessly.'
  },
  {
    id       : 'st-05',
    frequency: 99.0,
    type     : 'morse',
    name     : 'The Operator',
    content  : 'MEET ME AT THE LIGHTHOUSE'
  },
  {
    id       : 'st-06',
    frequency: 101.4,
    type     : 'fragment',
    name     : 'Room Tone',
    content  : 'Breathing. A door. Silence.'
  },
  {
    id       : 'st-07',
    frequency: 104.8,
    type     : 'music',
    name     : 'End Credits',
    content  : 'A slow descending phrase that never quite resolves.'
  },
  {
    id       : 'st-08',
    frequency: 107.1,
    type     : 'morse',
    name     : 'Last Transmission',
    content  : 'DO NOT COME HERE'
  }
];

/* ── Signal strength helpers ──────────────────────────────── */

/** Half-width of the reception window in MHz. */
var SIGNAL_RADIUS = 0.5;

/** Lock threshold — must be within this many MHz to lock. */
var LOCK_THRESHOLD = 0.1;

/**
 * Return signal strength 0–1 for a given dial frequency.
 * Uses a smooth squared falloff so approach feels gradual.
 * @param {number} dialFreq
 * @returns {{ station: object|null, strength: number }}
 */
function getSignalStrength(dialFreq) {
  var best     = null;
  var bestDist = Infinity;

  for (var i = 0; i < STATIONS.length; i++) {
    var dist = Math.abs(dialFreq - STATIONS[i].frequency);
    if (dist < bestDist) {
      bestDist = dist;
      best     = STATIONS[i];
    }
  }

  if (!best || bestDist >= SIGNAL_RADIUS) {
    return { station: null, strength: 0 };
  }

  /* Smooth curve: 1 at centre, 0 at radius edge */
  var t        = bestDist / SIGNAL_RADIUS;   // 0 → 1
  var strength = 1 - (t * t);               // quadratic ease-out

  return { station: best, strength: strength };
}

/**
 * Return the nearest station object regardless of distance.
 */
function getNearestStation(dialFreq) {
  var best     = null;
  var bestDist = Infinity;
  for (var i = 0; i < STATIONS.length; i++) {
    var dist = Math.abs(dialFreq - STATIONS[i].frequency);
    if (dist < bestDist) { bestDist = dist; best = STATIONS[i]; }
  }
  return best;
}

