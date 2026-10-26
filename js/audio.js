/* =============================================================
   audio.js  -  AudioContext, noise, station synthesis.
   Slice 1: white-noise static, filter sweep, crackle.
   Slice 2: music/morse/fragment audio + signal cross-fade.
   Slice 3: real Morse keying, key-callback for visual sync.
================================================================ */

var AudioEngine = (function () {

  var MASTER_GAIN        = 0.08;
  var NOISE_BUFFER_SECS  = 3;
  var STATIC_FILTER_BASE = 800;
  var STATIC_FILTER_MOVE = 3200;
  var FILTER_Q           = 2.5;
  var SETTLE_MS          = 600;
  var STATION_FADE_IN    = 0.35;
  var STATION_FADE_OUT   = 0.45;
  var STATIC_DUCK_FLOOR  = 0.15;
  var MUSIC_GAIN         = 0.18;
  var TONE_GAIN          = 0.25;

  var ctx = null; var masterGain = null; var staticGain = null;
  var filterNode = null; var noiseSource = null; var crackleGain = null;
  var stationGain = null; var activePlayer = null; var activeStation = null;
  var muted = false; var volumeLevel = 1.0; var settleTimer = null; var ready = false;

  /* Slice 3: Morse state */
  var morseKeyCallback = null;
  var morseUnitMs      = 300;   /* default: slow */

  function rampGain(gainNode, target, dur) {
    var now = ctx.currentTime;
    gainNode.gain.cancelScheduledValues(now);
    gainNode.gain.setValueAtTime(gainNode.gain.value, now);
    gainNode.gain.linearRampToValueAtTime(target, now + dur);
  }

  function buildNoiseBuffer(amp) {
    var sr = ctx.sampleRate; var fc = sr * NOISE_BUFFER_SECS;
    var buf = ctx.createBuffer(1, fc, sr); var d = buf.getChannelData(0);
    for (var i = 0; i < fc; i++) d[i] = (Math.random() * 2 - 1) * amp;
    return buf;
  }

  function buildStaticChain() {
    filterNode = ctx.createBiquadFilter(); filterNode.type = 'lowpass'; filterNode.frequency.value = STATIC_FILTER_BASE; filterNode.Q.value = FILTER_Q;
    staticGain = ctx.createGain(); staticGain.gain.value = 1.0;
    crackleGain = ctx.createGain(); crackleGain.gain.value = 0;
    var nb = buildNoiseBuffer(0.4);
    noiseSource = ctx.createBufferSource(); noiseSource.buffer = nb; noiseSource.loop = true;
    var cs = ctx.createBufferSource(); cs.buffer = nb; cs.loop = true;
    noiseSource.connect(filterNode); filterNode.connect(staticGain); staticGain.connect(masterGain);
    cs.connect(crackleGain); crackleGain.connect(masterGain);
    noiseSource.start(); cs.start();
  }

  function buildStationChain() {
    stationGain = ctx.createGain(); stationGain.gain.value = 0; stationGain.connect(masterGain);
  }

  /* Music generator (Slice 2, unchanged) */
  function makeMusicPlayer(station, outputGain) {
    var melodies = {};
    melodies['st-01'] = { notes:[261.6,293.7,329.6,349.2,329.6,293.7], tempo:0.55, wave:'sine' };
    melodies['st-04'] = { notes:[392.0,349.2,392.0],                    tempo:0.40, wave:'triangle' };
    melodies['st-07'] = { notes:[440.0,415.3,392.0,349.2,329.6],        tempo:0.70, wave:'sine' };
    var mel = melodies[station.id] || { notes:[261.6,329.6,392.0], tempo:0.55, wave:'sine' };
    var notes = mel.notes; var tempo = mel.tempo; var wave = mel.wave;
    var stopped = false; var oscs = []; var ni = 0; var nxt = ctx.currentTime + 0.05;
    function sched() {
      if (stopped) return;
      while (nxt < ctx.currentTime + 0.3) {
        var fr = notes[ni % notes.length]; ni++;
        var osc = ctx.createOscillator(); var env = ctx.createGain();
        osc.type = wave; osc.frequency.value = fr; env.gain.value = 0;
        osc.connect(env); env.connect(outputGain); osc.start(nxt);
        var t = nxt; var dur = tempo * 0.85;
        env.gain.setValueAtTime(0, t);
        env.gain.linearRampToValueAtTime(MUSIC_GAIN, t + 0.04);
        env.gain.setValueAtTime(MUSIC_GAIN, t + dur - 0.06);
        env.gain.linearRampToValueAtTime(0, t + dur);
        osc.stop(t + dur + 0.01); oscs.push(osc); nxt += tempo;
      }
      oscs = oscs.filter(function (o) { try { return o.playbackState !== 3; } catch (e) { return true; } });
    }
    var tmr = setInterval(sched, 50); sched();
    return { outputGain: outputGain, stop: function () { stopped = true; clearInterval(tmr); oscs.forEach(function (o) { try { o.stop(); } catch (e) {} }); oscs = []; } };
  }

  /* Slice 3: real Morse generator */
  function makeMorsePlayer(station, outputGain) {
    if (typeof Morse === 'undefined') return makeMorseFallback(station, outputGain);
    var stopped = false;
    var seq = Morse.toSequence(station.content);
    if (!seq || !seq.length) return makeMorseFallback(station, outputGain);
    var osc = ctx.createOscillator(); var env = ctx.createGain();
    osc.type = 'sine'; osc.frequency.value = 600; env.gain.value = 0;
    osc.connect(env); env.connect(outputGain); osc.start();
    var tmr = null; var si = 0;
    var RAMP = 0.005;
    function schedNext() {
      if (stopped) return;
      if (si >= seq.length) {
        var pauseMs = Math.max(1500, morseUnitMs * 14);
        si = 0;
        if (morseKeyCallback) morseKeyCallback(false, 'loop', 0);
        tmr = setTimeout(schedNext, pauseMs);
        return;
      }
      var ev = seq[si++];
      var durMs = ev.units * morseUnitMs;
      var durSec = durMs / 1000;
      var t = ctx.currentTime;
      if (ev.on) {
        env.gain.cancelScheduledValues(t);
        env.gain.setValueAtTime(env.gain.value, t);
        env.gain.linearRampToValueAtTime(TONE_GAIN, t + RAMP);
        env.gain.setValueAtTime(TONE_GAIN, t + durSec - RAMP);
        env.gain.linearRampToValueAtTime(0, t + durSec);
        if (morseKeyCallback) morseKeyCallback(true, ev.symbol, 0);
        tmr = setTimeout(function () {
          if (morseKeyCallback) morseKeyCallback(false, '', 0);
          schedNext();
        }, durMs);
      } else {
        if (morseKeyCallback) morseKeyCallback(false, ev.symbol, ev.units);
        tmr = setTimeout(schedNext, durMs);
      }
    }
    schedNext();
    return {
      outputGain: outputGain,
      stop: function () {
        stopped = true;
        if (tmr) clearTimeout(tmr);
        if (morseKeyCallback) morseKeyCallback(false, '');
        var t = ctx.currentTime;
        env.gain.cancelScheduledValues(t);
        env.gain.setValueAtTime(env.gain.value, t);
        env.gain.linearRampToValueAtTime(0, t + 0.02);
        try { osc.stop(t + 0.05); } catch (e) {}
      }
    };
  }

  /* Fallback if Morse library not loaded */
  function makeMorseFallback(station, outputGain) {
    var stopped = false; var osc = ctx.createOscillator(); var env = ctx.createGain();
    osc.type = 'sine'; osc.frequency.value = 600; env.gain.value = 0;
    osc.connect(env); env.connect(outputGain); osc.start();
    var tmr = setInterval(function () {
      if (stopped) return;
      var t = ctx.currentTime;
      env.gain.cancelScheduledValues(t); env.gain.setValueAtTime(0, t);
      env.gain.linearRampToValueAtTime(TONE_GAIN, t + 0.01);
      env.gain.setValueAtTime(TONE_GAIN, t + 0.1); env.gain.linearRampToValueAtTime(0, t + 0.12);
    }, 260);
    return { outputGain: outputGain, stop: function () { stopped = true; clearInterval(tmr); try { osc.stop(); } catch(e){} } };
  }

  /* Fragment generator (Slice 4: synthesized sounds matching story captions) */

  /* st-03 The Hiss: filtered tape noise + slow voice-like countdown pulses */
  function makeHissPlayer(outputGain) {
    var stopped = false;
    var hissNoise = ctx.createBufferSource();
    var hissBuf   = buildNoiseBuffer(0.5);
    hissNoise.buffer = hissBuf; hissNoise.loop = true;
    var hissBP = ctx.createBiquadFilter();
    hissBP.type = 'bandpass'; hissBP.frequency.value = 3200; hissBP.Q.value = 0.8;
    var hissGainNode = ctx.createGain(); hissGainNode.gain.value = 0.38;
    hissNoise.connect(hissBP); hissBP.connect(hissGainNode);
    hissGainNode.connect(outputGain);
    hissNoise.start();
    var PULSE_COUNT = 10; var PULSE_INTERVAL = 1600; var LOOP_PAUSE = 3200;
    var PULSE_DUR_SEC = 0.28; var pulseIdx = 0; var pulseTmr = null;
    function nextPulse() {
      if (stopped) return;
      if (pulseIdx >= PULSE_COUNT) {
        pulseIdx = 0; pulseTmr = setTimeout(nextPulse, LOOP_PAUSE); return;
      }
      var freq = 320 - pulseIdx * 22;
      var osc  = ctx.createOscillator(); var env = ctx.createGain();
      osc.type = 'triangle'; osc.frequency.value = freq; env.gain.value = 0;
      osc.connect(env); env.connect(outputGain);
      var t = ctx.currentTime; osc.start(t);
      env.gain.setValueAtTime(0, t);
      env.gain.linearRampToValueAtTime(0.07, t + 0.06);
      env.gain.setValueAtTime(0.07, t + PULSE_DUR_SEC - 0.08);
      env.gain.linearRampToValueAtTime(0, t + PULSE_DUR_SEC);
      osc.stop(t + PULSE_DUR_SEC + 0.02);
      pulseIdx++; pulseTmr = setTimeout(nextPulse, PULSE_INTERVAL);
    }
    nextPulse();
    return { outputGain: outputGain, stop: function () {
      stopped = true; if (pulseTmr) clearTimeout(pulseTmr);
      try { hissNoise.stop(); } catch (e) {}
    }};
  }


  /* st-06 Room Tone: low room hum + sparse soft events */
  function makeRoomTonePlayer(outputGain) {
    var stopped = false;
    var hum1 = ctx.createOscillator(); var hum2 = ctx.createOscillator();
    var humEnv = ctx.createGain();
    hum1.type = 'sine'; hum1.frequency.value = 52;
    hum2.type = 'sine'; hum2.frequency.value = 53.4;
    humEnv.gain.value = 0.06;
    hum1.connect(humEnv); hum2.connect(humEnv); humEnv.connect(outputGain);
    hum1.start(); hum2.start();
    var eventQueue = ['click', 'creak', 'door', 'silence', 'silence'];
    var eventTmr = null;
    function makeKettleClick() {
      var src = ctx.createBufferSource(); src.buffer = buildNoiseBuffer(1.0);
      var filt = ctx.createBiquadFilter();
      filt.type = 'highpass'; filt.frequency.value = 1800;
      var env = ctx.createGain(); env.gain.value = 0;
      src.connect(filt); filt.connect(env); env.connect(outputGain);
      var t = ctx.currentTime; src.start(t);
      env.gain.setValueAtTime(0, t);
      env.gain.linearRampToValueAtTime(0.12, t + 0.003);
      env.gain.exponentialRampToValueAtTime(0.001, t + 0.07);
      src.stop(t + 0.08);
    }
    function makeChairCreak() {
      var osc = ctx.createOscillator(); var env = ctx.createGain();
      osc.type = 'sine'; osc.frequency.value = 140; env.gain.value = 0;
      osc.connect(env); env.connect(outputGain);
      var t = ctx.currentTime; osc.start(t);
      osc.frequency.setValueAtTime(140, t);
      osc.frequency.linearRampToValueAtTime(118, t + 0.35);
      env.gain.setValueAtTime(0, t);
      env.gain.linearRampToValueAtTime(0.09, t + 0.08);
      env.gain.setValueAtTime(0.09, t + 0.22);
      env.gain.linearRampToValueAtTime(0, t + 0.45);
      osc.stop(t + 0.5);
    }
    function makeDoorThud() {
      var osc = ctx.createOscillator(); var env = ctx.createGain();
      osc.type = 'sine'; osc.frequency.value = 68; env.gain.value = 0;
      osc.connect(env); env.connect(outputGain);
      var t = ctx.currentTime; osc.start(t);
      env.gain.setValueAtTime(0, t);
      env.gain.linearRampToValueAtTime(0.14, t + 0.012);
      env.gain.exponentialRampToValueAtTime(0.001, t + 0.32);
      osc.stop(t + 0.35);
    }
    function scheduleEvent() {
      if (stopped) return;
      eventTmr = setTimeout(fireEvent, 3000 + Math.random() * 6000);
    }
    function fireEvent() {
      if (stopped) return;
      var pick = eventQueue[Math.floor(Math.random() * eventQueue.length)];
      if (pick === 'click')  makeKettleClick();
      if (pick === 'creak')  makeChairCreak();
      if (pick === 'door')   makeDoorThud();
      scheduleEvent();
    }
    scheduleEvent();
    return { outputGain: outputGain, stop: function () {
      stopped = true; if (eventTmr) clearTimeout(eventTmr);
      try { hum1.stop(); } catch (e) {}
      try { hum2.stop(); } catch (e) {}
    }};
  }

  /* Fragment dispatcher */
  function makeFragmentPlayer(station, outputGain) {
    if (station.id === 'st-03') return makeHissPlayer(outputGain);
    if (station.id === 'st-06') return makeRoomTonePlayer(outputGain);
    return makeHissPlayer(outputGain);
  }

  /* Station lifecycle */
  function startStation(station) {
    if (activeStation && activeStation.id === station.id) return;
    stopStation(false);
    activeStation = station;
    var og = ctx.createGain(); og.gain.value = 0; og.connect(stationGain);
    if      (station.type === 'music') { activePlayer = makeMusicPlayer(station, og); }
    else if (station.type === 'morse') { activePlayer = makeMorsePlayer(station, og); }
    else                                   { activePlayer = makeFragmentPlayer(station, og); }
  }

  function stopStation(withFade) {
    if (!activePlayer) return;
    var player = activePlayer; var og = player.outputGain;
    activePlayer = null; activeStation = null;
    if (og && withFade !== false) {
      rampGain(og, 0, STATION_FADE_OUT);
      setTimeout(function () { try { player.stop(); } catch (e) {} }, Math.round(STATION_FADE_OUT * 1000) + 50);
    } else { try { player.stop(); } catch (e) {} }
  }

  function setStationStrength(station, strength) {
    if (!ready) return;
    if (strength > 0.05) {
      startStation(station);
      if (activePlayer && activePlayer.outputGain) rampGain(activePlayer.outputGain, strength, STATION_FADE_IN);
      rampGain(staticGain, STATIC_DUCK_FLOOR + (1 - STATIC_DUCK_FLOOR) * (1 - strength), STATION_FADE_IN);
    } else {
      if (activeStation) stopStation(true);
      rampGain(staticGain, 1.0, STATION_FADE_OUT);
    }
  }

  /* Core init and controls */
  function init() {
    if (ready) return true;
    try {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      masterGain = ctx.createGain(); masterGain.gain.value = 0; masterGain.connect(ctx.destination);
      buildStaticChain(); buildStationChain();
      rampGain(masterGain, MASTER_GAIN * volumeLevel, 0.2);
      ready = true; return true;
    } catch (e) { console.warn('Late Night Radio: Web Audio init failed -', e); return false; }
  }

  function resume() {
    if (ctx && ctx.state === 'suspended') ctx.resume().catch(function () {});
  }

  function settle() {
    if (!ready) return;
    var now = ctx.currentTime;
    filterNode.frequency.cancelScheduledValues(now);
    filterNode.frequency.setValueAtTime(filterNode.frequency.value, now);
    filterNode.frequency.linearRampToValueAtTime(STATIC_FILTER_BASE, now + 0.4);
  }

  function onDialMove(sweeping) {
    if (!ready) return;
    resume();
    if (sweeping) {
      var now = ctx.currentTime;
      filterNode.frequency.cancelScheduledValues(now);
      filterNode.frequency.setValueAtTime(filterNode.frequency.value, now);
      filterNode.frequency.linearRampToValueAtTime(STATIC_FILTER_MOVE, now + 0.08);
      var cn = ctx.currentTime;
      crackleGain.gain.cancelScheduledValues(cn);
      crackleGain.gain.setValueAtTime(crackleGain.gain.value, cn);
      crackleGain.gain.linearRampToValueAtTime(0.15, cn + 0.04);
      crackleGain.gain.linearRampToValueAtTime(0.0,  cn + 0.18);
      if (settleTimer) clearTimeout(settleTimer);
      settleTimer = setTimeout(function () { settle(); }, SETTLE_MS);
    }
  }

  function setVolume(level) {
    volumeLevel = Math.max(0, Math.min(1, level));
    if (!ready) return;
    rampGain(masterGain, muted ? 0 : MASTER_GAIN * volumeLevel, 0.05);
  }

  function toggleMute() {
    muted = !muted;
    if (!ready) return muted;
    rampGain(masterGain, muted ? 0 : MASTER_GAIN * volumeLevel, 0.05);
    return muted;
  }

  function setStaticLevel(level, durationSec) {
    if (!ready) return;
    rampGain(staticGain, Math.max(0, Math.min(1, level)), durationSec || 0.3);
  }

  /* Slice 3: Morse control */
  function setMorseKeyCallback(fn) { morseKeyCallback = fn; }
  function setMorseUnitMs(ms)       { morseUnitMs = Math.max(40, ms); }
  function getMorseUnitMs()          { return morseUnitMs; }

  function getContext()    { return ctx; }
  function getMasterGain() { return masterGain; }

  return {
    init               : init,
    resume             : resume,
    onDialMove         : onDialMove,
    setVolume          : setVolume,
    toggleMute         : toggleMute,
    setStaticLevel     : setStaticLevel,
    setStationStrength : setStationStrength,
    setMorseKeyCallback: setMorseKeyCallback,
    setMorseUnitMs     : setMorseUnitMs,
    getMorseUnitMs     : getMorseUnitMs,
    getContext         : getContext,
    getMasterGain      : getMasterGain,
    isMuted            : function () { return muted; },
    isReady            : function () { return ready; }
  };

}());
