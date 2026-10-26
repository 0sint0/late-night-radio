/* =============================================================
   story.js  -  Narrative data for all 8 stations.
   Slice 4: captions, clues, epilogue.
   Loaded before main.js.  No DOM, no audio.

   Structure per station:
     title   : short display title for the clue section
     caption : readable description of what is heard
               (music/fragment: square-bracket sound cues + any speech)
               (morse: the dot-dash reading)
     clue    : one calm sentence of story meaning
   Plus:
     EPILOGUE : object with title and paragraphs array
================================================================ */

var STORY = (function () {

  var DATA = {

    'st-01': {
      title  : 'The Lullaby Hour',
      caption: '[A delicate music-box melody drifts in from somewhere just out of ' +
               'reach. Then a voice, warm and unhurried:] \u201cGood evening, ' +
               'insomniacs. You found us again. Pull up a blanket.\u201d',
      clue   : 'She hosted a late-night show for people who could not sleep, ' +
               'and she read their letters on air.'
    },

    'st-02': {
      title  : 'Signal Zero',
      caption: '[Morse code, steady and patient, repeating without variation.]',
      clue   : 'The station kept transmitting long after its last broadcast night \u2014 ' +
               'running on its own, as though nothing had changed.'
    },

    'st-03': {
      title  : 'The Hiss',
      caption: '[Tape hiss, close and warm. A faint voice counts down slowly, ' +
               'each step lower in pitch than the last. Then silence. ' +
               'Then the hiss returns and it begins again.]',
      clue   : 'The final night of Night Owl FM was not live \u2014 ' +
               'it was pre-recorded onto tape, set to play from the beginning.'
    },

    'st-04': {
      title  : 'Carousel',
      caption: '[A bright, turning fairground tune, three notes round and round. ' +
               'Between loops, just audible: a child\u2019s laugh, and then her voice:] ' +
               '\u201cThis one\u2019s for Tomas. Every night, without fail.\u201d',
      clue   : 'A young listener named Tomas requested the same song every evening, ' +
               'and she always played it for him.'
    },

    'st-05': {
      title  : 'The Operator',
      caption: '[Morse code, measured and certain, repeating on a slow loop.]',
      clue   : 'She was not taken. She was not lost. She left of her own free will, ' +
               'and she left the door standing open.'
    },

    'st-06': {
      title  : 'Room Tone',
      caption: '[The low hum of an empty studio. A kettle clicks off. ' +
               'A chair creaks softly, once. A door closes with a quiet thud. ' +
               'Then just the hum, and the faint breath of the building settling.]',
      clue   : 'She left calmly \u2014 everything tidy, everything in its place. ' +
               'An ordinary departure, made extraordinary only by what followed.'
    },

    'st-07': {
      title  : 'End Credits',
      caption: '[A slow descending theme, notes stepping gently downward. ' +
               'A voice reads the credits in the same unhurried tone as always:] ' +
               '\u201cProduced by Night Owl FM. Presented by Ines Marlowe. ' +
               'Goodnight, all of you.\u201d',
      clue   : 'The sign-off credits name her clearly: Ines Marlowe, ' +
               'still thanking her listeners in the last breath of the broadcast.'
    },

    'st-08': {
      title  : 'Last Transmission',
      caption: '[Morse code, slow and unhurried. It has the quality of a letter ' +
               'left on a kitchen table: certain, and kind.]',
      clue   : 'She addressed her listeners one last time \u2014 ' +
               'not a distress signal, but a blessing. A goodnight.'
    }

  };

  var EPILOGUE = {
    title     : 'A Note Left on the Console',
    paragraphs: [
      'Ines Marlowe was not missing. On the last night of October 1987, she pre-recorded ' +
      'the full evening programme \u2014 music, readings, the credits \u2014 ' +
      'set it running on a timer, and walked out of the studio with her coat over her arm.',

      'She had decided, quietly and without drama, that it was time for a new chapter. ' +
      'She left the transmitter on a slow loop as a parting gift to her insomniac listeners: ' +
      'one last night of company, playing to empty rooms and dark windows.',

      'The station kept transmitting because nobody ever came to switch it off. ' +
      'The door had never been locked. The kettle was unplugged. ' +
      'The only thing she left behind, deliberately, was the music.',

      'Wherever Ines is now, she is almost certainly asleep \u2014 ' +
      'or perhaps, at this hour, she is the one tuning in.'
    ]
  };

  return {
    getData   : function (stationId) { return DATA[stationId] || null; },
    getEpilogue: function ()          { return EPILOGUE; },
    ALL_DATA  : DATA
  };

}());
