/* =============================================================
   morse.js  –  Pure Morse-code helpers.  No DOM, no audio.
   Slice 3.  Loaded before audio.js and main.js.

   Exports: window.Morse  (object with encode, toSequence, toString)
================================================================ */

var Morse = (function () {

  /* ── Code table ──────────────────────────────────────────── */

  var TABLE = {
    'A': '.-',    'B': '-...',  'C': '-.-.',  'D': '-..',
    'E': '.',     'F': '..-.',  'G': '--.',   'H': '....',
    'I': '..',    'J': '.---',  'K': '-.-',   'L': '.-..',
    'M': '--',    'N': '-.',    'O': '---',   'P': '.--.',
    'Q': '--.-',  'R': '.-.',   'S': '...',   'T': '-',
    'U': '..-',   'V': '...-',  'W': '.--',   'X': '-..-',
    'Y': '-.--',  'Z': '--..',
    '0': '-----', '1': '.----', '2': '..---', '3': '...--',
    '4': '....-', '5': '.....', '6': '-....', '7': '--...',
    '8': '---..', '9': '----.',
    '.': '.-.-.-', ',': '--..--', '?': '..--..',
    '!': '-.-.--', '/': '-..-.'
  };

  /**
   * Return the dot-dash string for a single character, or '' if unknown.
   * @param {string} ch  – single character (case-insensitive)
   * @returns {string}
   */
  function encode(ch) {
    return TABLE[ch.toUpperCase()] || '';
  }

  /**
   * Convert a message string to a dot-dash display string.
   * Letters are separated by a single space, words by ' / '.
   * Unknown characters are silently dropped.
   * e.g. "SOS" → "... --- ..."
   * e.g. "HI THERE" → ".... .. / - .... . .-. ."
   * @param {string} message
   * @returns {string}
   */
  function toString(message) {
    var words = message.toUpperCase().split(/\s+/);
    var out   = [];
    for (var w = 0; w < words.length; w++) {
      var word    = words[w];
      var letters = [];
      for (var c = 0; c < word.length; c++) {
        var code = TABLE[word[c]];
        if (code) letters.push(code);
      }
      if (letters.length) out.push(letters.join(' '));
    }
    return out.join(' / ');
  }

  /**
   * Convert a message to a flat array of timed on/off events.
   *
   * Standard Morse timing (in units):
   *   dot         = 1   (on)
   *   dash        = 3   (on)
   *   intra-char  = 1   (off, between dots/dashes within a letter)
   *   inter-char  = 3   (off, between letters within a word)
   *   inter-word  = 7   (off, between words)
   *
   * Each event: { on: bool, units: number, symbol: string }
   *   symbol is '.' | '-' | '' (for silences)
   *
   * Unknown characters are silently skipped.
   *
   * @param {string} message
   * @returns {Array<{on:boolean, units:number, symbol:string}>}
   */
  function toSequence(message) {
    var events = [];
    var words  = message.toUpperCase().split(/\s+/);

    for (var w = 0; w < words.length; w++) {
      if (w > 0) {
        /* inter-word gap — already includes the inter-char gap from the
           previous letter's trailing silence, so subtract 3 already counted:
           7 total - 3 inter-char already appended = 4 extra units.
           But we append as a standalone gap here for simplicity; the
           inter-char gap is NOT added after the last letter of a word,
           so we can just add 7 directly. */
        events.push({ on: false, units: 7, symbol: '' });
      }

      var word = words[w];
      var lettersPlayed = 0;

      for (var c = 0; c < word.length; c++) {
        var code = TABLE[word[c]];
        if (!code) continue;

        if (lettersPlayed > 0) {
          events.push({ on: false, units: 3, symbol: '' }); /* inter-char */
        }
        lettersPlayed++;

        for (var i = 0; i < code.length; i++) {
          if (i > 0) {
            events.push({ on: false, units: 1, symbol: '' }); /* intra-char */
          }
          var sym = code[i];
          events.push({ on: true, units: sym === '-' ? 3 : 1, symbol: sym });
        }
      }
    }

    return events;
  }

  /* ── Public API ──────────────────────────────────────────── */

  return {
    encode    : encode,
    toString  : toString,
    toSequence: toSequence,
    TABLE     : TABLE     /* exposed for the chart panel */
  };

}());
