/* =============================================================
   audio.js  -  AudioContext, noise, station synthesis.
   Slice 1: white-noise static, filter sweep, crackle.
   Slice 2: music/morse/fragment audio + signal cross-fade.
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

  /* ---- Music station generator ---- */
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

  /* ---- Morse placeholder generator ---- */
  function makeMorsePlaceholder(station, outputGain) {
    var stopped = false;
    var osc = ctx.createOscillator(); var env = ctx.createGain();
    osc.type = 'sine'; osc.frequency.value = 600; env.gain.value = 0;
    osc.connect(env); env.connect(outputGain); osc.start();
    var dotDur = 0.12; var cycleMs = 260;
    function pulse() {
      if (stopped) return;
      var t = ctx.currentTime;
      env.gain.cancelScheduledValues(t);
      env.gain.setValueAtTime(0, t);
      env.gain.linearRampToValueAtTime(TONE_GAIN, t + 0.01);
      env.gain.setValueAtTime(TONE_GAIN, t + dotDur - 0.01);
      env.gain.linearRampToValueAtTime(0, t + dotDur);
    }
    pulse();
    var tmr = setInterval(pulse, cycleMs);
    return { outputGain: outputGain, stop: function () { stopped = true; clearInterval(tmr); var t = ctx.currentTime; env.gain.cancelScheduledValues(t); env.gain.setValueAtTime(env.gain.value, t); env.gain.linearRampToValueAtTime(0, t + 0.05); try { osc.stop(t + 0.1); } catch (e) {} } };
  }

  /* ---- Fragment generator ---- */
  function makeFragmentPlayer(station, outputGain) {
    var stopped = false; var patterns = {};
    patterns['st-03'] = { freqs:[220,277.2,185], timings:[300,500,700,1100] };
    patterns['st-06'] = { freqs:[110,138.6],     timings:[1200,400,1800,600] };
    var pat = patterns[station.id] || { freqs:[220,277.2,185], timings:[300,500,700,1100] };
    var freqs = pat.freqs; var times = pat.timings;
    var fi = 0; var ti = 0; var tmr = null;
    function playNext() {
      if (stopped) return;
      var osc = ctx.createOscillator(); var env = ctx.createGain();
      osc.type = 'sine'; osc.frequency.value = freqs[fi % freqs.length]; fi++;
      env.gain.value = 0;
      osc.connect(env); env.connect(outputGain);
      var t = ctx.currentTime; var dur = 0.18;
      osc.start(t);
      env.gain.setValueAtTime(0, t);
      env.gain.linearRampToValueAtTime(TONE_GAIN * 0.8, t + 0.03);
      env.gain.setValueAtTime(TONE_GAIN * 0.8, t + dur - 0.03);
      env.gain.linearRampToValueAtTime(0, t + dur);
      osc.stop(t + dur + 0.01);
      tmr = setTimeout(playNext, times[ti % times.length]); ti++;
    }
    playNext();
    return { outputGain: outputGain, stop: function () { stopped = true; if (tmr) clearTimeout(tmr); } };
  }

  /* ---- Station lifecycle ---- */
  function startStation(station) {
    if (activeStation && activeStation.id === station.id) return;
    stopStation(false);
    activeStation = station;
    var og = ctx.createGain(); og.gain.value = 0; og.connect(stationGain);
    if      (station.type === 'music') { activePlayer = makeMusicPlayer(station, og); }
    else if (station.type === 'morse') { activePlayer = makeMorsePlaceholder(station, og); }
    else                                 { activePlayer = makeFragmentPlayer(station, og); }
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

  /* ---- Core init and controls ---- */
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
    getContext         : getContext,
    getMasterGain      : getMasterGain,
    isMuted            : function () { return muted; },
    isReady            : function () { return ready; }
  };

}());
