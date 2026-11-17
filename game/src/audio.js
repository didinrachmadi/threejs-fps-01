// Procedural sound: every effect is synthesized with WebAudio, so the game ships
// no audio files and makes no network request. Silent until the first user gesture
// creates the context; every call is guarded, so a headless browser never errors.
export function createAudio() {
  let ctx = null;
  let master = null;

  function ensure() {
    if (ctx) return true;
    try {
      const AC = window.AudioContext ?? window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.35;
      master.connect(ctx.destination);
    } catch {
      return false;
    }
    return true;
  }

  function noiseBurst(duration, filterFreq, gainValue, type = 'lowpass') {
    if (!ensure() || ctx.state === 'suspended') return;
    try {
      const len = Math.max(1, Math.floor(ctx.sampleRate * duration));
      const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < len; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      const filter = ctx.createBiquadFilter();
      filter.type = type;
      filter.frequency.value = filterFreq;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(gainValue, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
      src.connect(filter).connect(gain).connect(master);
      src.start();
    } catch {
      // Sound is decoration; never let it break the game.
    }
  }

  function tone(freq, duration, gainValue, type = 'sine', slideTo = null) {
    if (!ensure() || ctx.state === 'suspended') return;
    try {
      const osc = ctx.createOscillator();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, ctx.currentTime);
      if (slideTo !== null) osc.frequency.exponentialRampToValueAtTime(slideTo, ctx.currentTime + duration);
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(gainValue, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
      osc.connect(gain).connect(master);
      osc.start();
      osc.stop(ctx.currentTime + duration);
    } catch {
      // Sound is decoration; never let it break the game.
    }
  }

  return {
    unlock() {
      ensure();
      if (ctx?.state === 'suspended') ctx.resume().catch(() => {});
    },
    shot() {
      noiseBurst(0.12, 1800, 0.9);
      tone(140, 0.09, 0.5, 'square', 60);
    },
    enemyShot(distance) {
      const g = Math.max(0.05, 0.5 - distance * 0.008);
      noiseBurst(0.1, 1200, g);
    },
    dryFire() {
      tone(1200, 0.04, 0.2, 'square');
    },
    reload() {
      tone(500, 0.05, 0.25, 'square');
      setTimeout(() => tone(700, 0.05, 0.25, 'square'), 180);
    },
    hit() {
      tone(1800, 0.05, 0.3, 'sine');
    },
    kill() {
      tone(900, 0.08, 0.35, 'sine', 1400);
    },
    hurt() {
      tone(220, 0.15, 0.4, 'sawtooth', 110);
    },
    explosion() {
      noiseBurst(0.9, 300, 1);
      tone(70, 0.7, 0.6, 'sine', 30);
    },
    beep() {
      tone(1100, 0.07, 0.3, 'square');
    },
    plant() {
      tone(700, 0.1, 0.3, 'square');
      setTimeout(() => tone(1050, 0.12, 0.3, 'square'), 120);
    },
    buy() {
      tone(1200, 0.06, 0.3, 'sine', 1800);
    },
    roundWin() {
      tone(523, 0.12, 0.3, 'sine');
      setTimeout(() => tone(659, 0.12, 0.3, 'sine'), 130);
      setTimeout(() => tone(784, 0.2, 0.35, 'sine'), 260);
    },
    roundLose() {
      tone(392, 0.15, 0.3, 'sine');
      setTimeout(() => tone(311, 0.25, 0.3, 'sine'), 160);
    },
  };
}
