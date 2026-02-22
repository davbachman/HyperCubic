function createNoiseBuffer(context) {
  const sampleRate = context.sampleRate;
  const length = Math.floor(sampleRate * 0.75);
  const buffer = context.createBuffer(1, length, sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i += 1) {
    data[i] = Math.random() * 2 - 1;
  }
  return buffer;
}

function rampGain(gainParam, now, attack, peak, release) {
  gainParam.cancelScheduledValues(now);
  gainParam.setValueAtTime(0.0001, now);
  gainParam.exponentialRampToValueAtTime(Math.max(0.0001, peak), now + attack);
  gainParam.exponentialRampToValueAtTime(0.0001, now + attack + release);
}

function startScopedSource(source, stopAt) {
  source.start();
  source.stop(stopAt);
}

export function createSoundscape() {
  /** @type {AudioContext|null} */
  let context = null;
  /** @type {GainNode|null} */
  let masterGain = null;
  /** @type {GainNode|null} */
  let ambienceGate = null;
  /** @type {AudioBuffer|null} */
  let noiseBuffer = null;
  let ambienceReady = false;
  let idlePulseActive = false;

  function getContextConstructor() {
    return window.AudioContext || window.webkitAudioContext || null;
  }

  function ensureContext() {
    if (context) {
      return context;
    }

    const AudioContextCtor = getContextConstructor();
    if (!AudioContextCtor) {
      return null;
    }

    context = new AudioContextCtor();
    masterGain = context.createGain();
    masterGain.gain.value = 0.72;
    masterGain.connect(context.destination);

    ambienceGate = context.createGain();
    ambienceGate.gain.value = 0.0001;
    ambienceGate.connect(masterGain);

    noiseBuffer = createNoiseBuffer(context);

    return context;
  }

  function ensureAmbience() {
    const ctx = ensureContext();
    if (!ctx || ambienceReady) {
      return;
    }

    const lowpass = ctx.createBiquadFilter();
    lowpass.type = 'lowpass';
    lowpass.frequency.value = 260;
    lowpass.Q.value = 0.6;

    const droneA = ctx.createOscillator();
    droneA.type = 'triangle';
    droneA.frequency.value = 43;

    const droneB = ctx.createOscillator();
    droneB.type = 'sawtooth';
    droneB.frequency.value = 86;
    droneB.detune.value = -6;

    const droneAGain = ctx.createGain();
    droneAGain.gain.value = 0.085;
    const droneBGain = ctx.createGain();
    droneBGain.gain.value = 0.048;

    const pulseLfo = ctx.createOscillator();
    pulseLfo.type = 'sine';
    pulseLfo.frequency.value = 0.58;
    const pulseDepth = ctx.createGain();
    pulseDepth.gain.value = 0.09;
    const pulseBias = ctx.createConstantSource();
    pulseBias.offset.value = 0.082;

    droneA.connect(droneAGain).connect(lowpass);
    droneB.connect(droneBGain).connect(lowpass);
    lowpass.connect(ambienceGate);
    pulseLfo.connect(pulseDepth).connect(ambienceGate.gain);
    pulseBias.connect(ambienceGate.gain);

    droneA.start();
    droneB.start();
    pulseLfo.start();
    pulseBias.start();
    ambienceReady = true;
  }

  function prime() {
    const ctx = ensureContext();
    if (!ctx) {
      return;
    }
    ensureAmbience();
    if (ctx.state !== 'running') {
      ctx.resume().catch(() => {});
    }
  }

  function setIdlePulseActive(active) {
    idlePulseActive = active;
    const ctx = ensureContext();
    if (!ctx || !ambienceGate) {
      return;
    }
    const now = ctx.currentTime;
    const target = active ? 1 : 0.0001;
    ambienceGate.gain.cancelScheduledValues(now);
    ambienceGate.gain.setTargetAtTime(target, now, 0.16);
  }

  function playTurn() {
    const ctx = ensureContext();
    if (!ctx || ctx.state !== 'running' || !masterGain) {
      return;
    }

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(190, now);
    osc.frequency.exponentialRampToValueAtTime(410, now + 0.16);

    const band = ctx.createBiquadFilter();
    band.type = 'bandpass';
    band.frequency.value = 880;
    band.Q.value = 2.2;

    const gain = ctx.createGain();
    rampGain(gain.gain, now, 0.014, 0.12, 0.21);

    osc.connect(band).connect(gain).connect(masterGain);
    startScopedSource(osc, now + 0.26);
  }

  function playMisaligned() {
    const ctx = ensureContext();
    if (!ctx || ctx.state !== 'running' || !masterGain) {
      return;
    }

    const now = ctx.currentTime;
    const oscA = ctx.createOscillator();
    oscA.type = 'square';
    oscA.frequency.setValueAtTime(148, now);
    oscA.frequency.exponentialRampToValueAtTime(96, now + 0.2);

    const oscB = ctx.createOscillator();
    oscB.type = 'sawtooth';
    oscB.frequency.setValueAtTime(92, now);
    oscB.frequency.exponentialRampToValueAtTime(70, now + 0.2);

    const lowpass = ctx.createBiquadFilter();
    lowpass.type = 'lowpass';
    lowpass.frequency.value = 760;
    lowpass.Q.value = 0.8;

    const gain = ctx.createGain();
    rampGain(gain.gain, now, 0.008, 0.135, 0.19);

    oscA.connect(lowpass);
    oscB.connect(lowpass);
    lowpass.connect(gain).connect(masterGain);

    startScopedSource(oscA, now + 0.24);
    startScopedSource(oscB, now + 0.24);
  }

  function playTraverseStart() {
    const ctx = ensureContext();
    if (!ctx || ctx.state !== 'running' || !masterGain || !noiseBuffer) {
      return;
    }

    const now = ctx.currentTime;

    const noise = ctx.createBufferSource();
    noise.buffer = noiseBuffer;
    const bandpass = ctx.createBiquadFilter();
    bandpass.type = 'bandpass';
    bandpass.frequency.setValueAtTime(180, now);
    bandpass.frequency.exponentialRampToValueAtTime(1280, now + 0.38);
    bandpass.Q.value = 1.4;
    const noiseGain = ctx.createGain();
    rampGain(noiseGain.gain, now, 0.02, 0.095, 0.38);
    noise.connect(bandpass).connect(noiseGain).connect(masterGain);
    startScopedSource(noise, now + 0.48);

    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(84, now);
    osc.frequency.exponentialRampToValueAtTime(56, now + 0.42);
    const oscGain = ctx.createGain();
    rampGain(oscGain.gain, now, 0.02, 0.13, 0.42);
    const lowpass = ctx.createBiquadFilter();
    lowpass.type = 'lowpass';
    lowpass.frequency.value = 420;
    lowpass.Q.value = 0.9;
    osc.connect(lowpass).connect(oscGain).connect(masterGain);
    startScopedSource(osc, now + 0.48);
  }

  function playTraverseSwapPulse() {
    const ctx = ensureContext();
    if (!ctx || ctx.state !== 'running' || !masterGain) {
      return;
    }

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(420, now);
    osc.frequency.exponentialRampToValueAtTime(820, now + 0.06);

    const gain = ctx.createGain();
    rampGain(gain.gain, now, 0.003, 0.15, 0.1);
    osc.connect(gain).connect(masterGain);
    startScopedSource(osc, now + 0.11);
  }

  function playWin() {
    const ctx = ensureContext();
    if (!ctx || ctx.state !== 'running' || !masterGain) {
      return;
    }

    const now = ctx.currentTime;
    const notes = [220, 277.18, 329.63, 440, 554.37];

    for (let i = 0; i < notes.length; i += 1) {
      const start = now + i * 0.11;
      const osc = ctx.createOscillator();
      osc.type = i % 2 === 0 ? 'triangle' : 'sawtooth';
      osc.frequency.setValueAtTime(notes[i], start);
      osc.frequency.exponentialRampToValueAtTime(notes[i] * 1.5, start + 0.19);

      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.16, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.22);

      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.value = 1200;
      filter.Q.value = 1.6;

      osc.connect(filter).connect(gain).connect(masterGain);
      osc.start(start);
      osc.stop(start + 0.24);
    }
  }

  function dispose() {
    if (context) {
      context.close().catch(() => {});
    }
    context = null;
    masterGain = null;
    ambienceGate = null;
    noiseBuffer = null;
    ambienceReady = false;
    idlePulseActive = false;
  }

  return {
    prime,
    setIdlePulseActive,
    onTurn: playTurn,
    onMisalignedSpace: playMisaligned,
    onTraverseStart: playTraverseStart,
    onTraverseSwap: playTraverseSwapPulse,
    onWin: playWin,
    dispose,
    // Useful for debug hooks/tests.
    isIdlePulseActive() {
      return idlePulseActive;
    },
  };
}
