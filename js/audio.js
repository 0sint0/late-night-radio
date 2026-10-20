/* =============================================================
   audio.js  –  AudioContext, static noise, master gain, helpers
   Slice 1: white-noise static, filter sweep on dial move, crackle.
   Slices 2-6 will add station tone rendering here.

   LOUD-SOUND NOTES (read before touching gains):
   - Master gain is MASTER_GAIN (0.08). Never raise above 0.20.
   - Noise buffer amplitude is 0.4 – headroom for filter boost.
   - BiquadFilter Q stays <= 4 to prevent resonance self-oscillation.
   - All gain changes use linearRampToValueAtTime (no clicks/pops).
   - crackleGain peaks at 0.15 * masterGain = ~0.012 effective – safe.
================================================================ */

var AudioEngine = (function () {

  var MASTER_GAIN        = 0.08;
  var NOISE_BUFFER_SECS  = 3;
  var STATIC_FILTER_BASE = 800;
  var STATIC_FILTER_MOVE = 3200;
  var FILTER_Q           = 2.5;
  var SETTLE_MS          = 600;

  var ctx            = null;
  var masterGain     = null;
  var staticGain     = null;
  var filterNode     = null;
  var noiseSource    = null;
  var crackleGain    = null;

  var muted          = false;
  var volumeLevel    = 1.0;
  var settleTimer    = null;
  var ready          = false;

  function rampGain(gainNode, target, durationSec) {
    var now = ctx.currentTime;
    gainNode.gain.cancelScheduledValues(now);
    gainNode.gain.setValueAtTime(gainNode.gain.value, now);
    gainNode.gain.linearRampToValueAtTime(target, now + durationSec);
  }

  function buildNoiseBuffer(amplitude) {
    var sampleRate  = ctx.sampleRate;
    var frameCount  = sampleRate * NOISE_BUFFER_SECS;
    var buffer      = ctx.createBuffer(1, frameCount, sampleRate);
    var data        = buffer.getChannelData(0);
    for (var i = 0; i < frameCount; i++) {
      data[i] = (Math.random() * 2 - 1) * amplitude;
    }
    return buffer;
  }

  function buildStaticChain() {
    filterNode = ctx.createBiquadFilter();
    filterNode.type            = 'lowpass';
    filterNode.frequency.value = STATIC_FILTER_BASE;
    filterNode.Q.value         = FILTER_Q;

    staticGain            = ctx.createGain();
    staticGain.gain.value = 1.0;

    crackleGain            = ctx.createGain();
    crackleGain.gain.value = 0;

    var noiseBuffer = buildNoiseBuffer(0.4);

    noiseSource = ctx.createBufferSource();
    noiseSource.buffer = noiseBuffer;
    noiseSource.loop   = true;

    var crackleSource = ctx.createBufferSource();
    crackleSource.buffer = noiseBuffer;
    crackleSource.loop   = true;

    noiseSource.connect(filterNode);
    filterNode.connect(staticGain);
    staticGain.connect(masterGain);

    crackleSource.connect(crackleGain);
    crackleGain.connect(masterGain);

    noiseSource.start();
    crackleSource.start();
  }

  function init() {
    if (ready) return true;
    try {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx        = new AC();
      masterGain = ctx.createGain();
      masterGain.gain.value = 0;
      masterGain.connect(ctx.destination);
      buildStaticChain();
      rampGain(masterGain, MASTER_GAIN * volumeLevel, 0.2);
      ready = true;
      return true;
    } catch (e) {
      console.warn('Late Night Radio: Web Audio init failed –', e);
      return false;
    }
  }

  function resume() {
    if (ctx && ctx.state === 'suspended') {
      ctx.resume().catch(function () {});
    }
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
    var target = muted ? 0 : MASTER_GAIN * volumeLevel;
    rampGain(masterGain, target, 0.05);
  }

  function toggleMute() {
    muted = !muted;
    if (!ready) return muted;
    var target = muted ? 0 : MASTER_GAIN * volumeLevel;
    rampGain(masterGain, target, 0.05);
    return muted;
  }

  function setStaticLevel(level, durationSec) {
    if (!ready) return;
    rampGain(staticGain, Math.max(0, Math.min(1, level)), durationSec || 0.3);
  }

  function getContext()    { return ctx; }
  function getMasterGain() { return masterGain; }

  return {
    init          : init,
    resume        : resume,
    onDialMove    : onDialMove,
    setVolume     : setVolume,
    toggleMute    : toggleMute,
    setStaticLevel: setStaticLevel,
    getContext    : getContext,
    getMasterGain : getMasterGain,
    isMuted       : function () { return muted; },
    isReady       : function () { return ready; }
  };

}());
