import type { SoundId } from './cues';

/**
 * Game sound, made with the Web Audio API.
 *
 * Every sound is synthesised in code (noise and oscillators), which suits the
 * 16-bit style and needs no files. To replace one with a recording later, put
 * the file in `public/sounds/` and add it to SOUND_FILES; it is loaded when
 * audio starts and then used instead of the synthesised version.
 *
 * iOS only allows audio to start from a user gesture, so `unlock()` must be
 * called from a tap or click handler before anything can be heard.
 */

/**
 * Recordings that replace synthesised sounds. Mono 22 kHz WAV: small, and
 * plays on every iPhone. Sources and licences: `public/sounds/CREDITS.md`.
 */
const SOUND_FILES: Partial<Record<SoundId, string>> = {
  /** The bridge held: the crowd cheers. */
  arrive: 'sounds/applause.wav',
  /** The bridge failed and the handcar goes over the edge. */
  scream: 'sounds/scream.wav',
};

/** A sound may not repeat faster than this (seconds), so e.g. creaks don't pile up. */
const MIN_INTERVAL: Partial<Record<SoundId, number>> = {
  creak: 0.7,
  crack: 0.08,
};

const MASTER_VOLUME = 0.5;

type Synth = (ctx: AudioContext, out: AudioNode, at: number) => void;

export class GameAudio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private readonly recordings = new Map<SoundId, AudioBuffer>();
  private readonly lastPlayed = new Map<SoundId, number>();
  private muted = false;
  /** The most recent sounds, newest last. For the dev debug hook. */
  readonly history: SoundId[] = [];

  /**
   * Creates or resumes the audio context. Call from a user gesture: on iOS
   * only some events count (touchend/pointerup and click, not touchstart), so
   * it is safe to call this from several handlers.
   */
  unlock(): void {
    if (!this.ctx) {
      const AudioContextClass = window.AudioContext;
      if (!AudioContextClass) return; // no Web Audio: play silently
      playEvenWhenSilenced();
      this.ctx = new AudioContextClass();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : MASTER_VOLUME;
      this.master.connect(this.ctx.destination);
      this.noise = createNoiseBuffer(this.ctx);
      void this.loadRecordings(this.ctx);
    }
    // iOS can also leave it 'interrupted' (after a call or the app was hidden).
    if (this.ctx.state !== 'running') {
      void this.ctx.resume();
      playSilence(this.ctx);
    }
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    if (this.master) this.master.gain.value = muted ? 0 : MASTER_VOLUME;
  }

  play(sound: SoundId): void {
    const { ctx, master } = this;
    if (!ctx || !master || this.muted) return;

    const now = ctx.currentTime;
    const last = this.lastPlayed.get(sound) ?? -Infinity;
    if (now - last < (MIN_INTERVAL[sound] ?? 0)) return;
    this.lastPlayed.set(sound, now);
    this.history.push(sound);
    if (this.history.length > 50) this.history.shift();

    const recording = this.recordings.get(sound);
    if (recording) {
      const source = ctx.createBufferSource();
      source.buffer = recording;
      source.connect(master);
      source.start(now);
    } else {
      this.synths[sound](ctx, master, now);
    }
  }

  /** Releases the audio hardware. The object can't be used afterwards. */
  close(): void {
    void this.ctx?.close();
    this.ctx = null;
    this.master = null;
  }

  private async loadRecordings(ctx: AudioContext): Promise<void> {
    for (const [sound, url] of Object.entries(SOUND_FILES) as [SoundId, string][]) {
      try {
        const response = await fetch(`${import.meta.env.BASE_URL}${url}`);
        this.recordings.set(sound, await ctx.decodeAudioData(await response.arrayBuffer()));
      } catch {
        // Keep using the synthesised sound if the file is missing or broken.
      }
    }
  }

  // -------------------------------------------------------------------------
  // Synthesised sounds
  // -------------------------------------------------------------------------

  private readonly synths: Record<SoundId, Synth> = {
    /** Two bright dings: a small bell on the handcar. */
    bell: (ctx, out, at) => {
      for (const offset of [0, 0.18]) {
        tone(ctx, out, 'sine', 1320, at + offset, 0.8, 0.3);
        tone(ctx, out, 'sine', 2640, at + offset, 0.4, 0.08);
      }
    },

    /** A short tick of filtered noise. */
    clack: (ctx, out, at) => {
      this.noiseBurst(ctx, out, at, 0.035, 0.18, 'highpass', 1800);
    },

    /** A low, wobbling groan, like wood under load. */
    creak: (ctx, out, at) => {
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(85, at);
      osc.frequency.linearRampToValueAtTime(130, at + 0.15);
      osc.frequency.linearRampToValueAtTime(95, at + 0.35);
      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.value = 650;
      filter.Q.value = 3;
      const gain = envelope(ctx, at, 0.05, 0.3, 0.2);
      osc.connect(filter).connect(gain).connect(out);
      osc.start(at);
      osc.stop(at + 0.4);
    },

    /** A sharp snap of noise with a low thump under it. */
    crack: (ctx, out, at) => {
      this.noiseBurst(ctx, out, at, 0.14, 0.9, 'bandpass', 2500);
      const thump = ctx.createOscillator();
      thump.frequency.setValueAtTime(140, at);
      thump.frequency.exponentialRampToValueAtTime(50, at + 0.15);
      const gain = envelope(ctx, at, 0.005, 0.15, 0.6);
      thump.connect(gain).connect(out);
      thump.start(at);
      thump.stop(at + 0.2);
    },

    /**
     * A cartoon "aaaah!": a buzzy tone falling in pitch, with vibrato, shaped
     * by two band-pass filters at the formants of an "ah" vowel.
     */
    scream: (ctx, out, at) => {
      const duration = 1.5;
      const voice = ctx.createOscillator();
      voice.type = 'sawtooth';
      voice.frequency.setValueAtTime(680, at);
      voice.frequency.exponentialRampToValueAtTime(240, at + duration);

      const vibrato = ctx.createOscillator();
      vibrato.frequency.value = 7;
      const vibratoDepth = ctx.createGain();
      vibratoDepth.gain.value = 30;
      vibrato.connect(vibratoDepth).connect(voice.frequency);

      const gain = envelope(ctx, at, 0.06, duration, 0.35);
      for (const [frequency, q] of [
        [850, 5],
        [1250, 6],
      ] as const) {
        const formant = ctx.createBiquadFilter();
        formant.type = 'bandpass';
        formant.frequency.value = frequency;
        formant.Q.value = q;
        voice.connect(formant).connect(gain);
      }
      gain.connect(out);
      for (const node of [voice, vibrato]) {
        node.start(at);
        node.stop(at + duration + 0.1);
      }
    },

    /** Noise sweeping from bright to dull, plus a few bubbles. */
    splash: (ctx, out, at) => {
      if (!this.noise) return;
      const source = ctx.createBufferSource();
      source.buffer = this.noise;
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(4000, at);
      filter.frequency.exponentialRampToValueAtTime(250, at + 0.8);
      const gain = envelope(ctx, at, 0.01, 0.8, 0.8);
      source.connect(filter).connect(gain).connect(out);
      source.start(at);
      source.stop(at + 0.9);

      for (const [offset, pitch] of [
        [0.25, 500],
        [0.4, 750],
        [0.55, 620],
      ] as const) {
        const bubble = ctx.createOscillator();
        bubble.frequency.setValueAtTime(pitch, at + offset);
        bubble.frequency.exponentialRampToValueAtTime(pitch * 2, at + offset + 0.06);
        const bubbleGain = envelope(ctx, at + offset, 0.005, 0.06, 0.15);
        bubble.connect(bubbleGain).connect(out);
        bubble.start(at + offset);
        bubble.stop(at + offset + 0.08);
      }
    },

    /** A happy rising arpeggio: C, E, G, C. */
    arrive: (ctx, out, at) => {
      [523, 659, 784, 1047].forEach((frequency, i) => {
        tone(ctx, out, 'square', frequency, at + i * 0.1, 0.12, 0.12);
      });
    },
  };

  /** A burst of white noise through a filter, fading out over `duration`. */
  private noiseBurst(
    ctx: AudioContext,
    out: AudioNode,
    at: number,
    duration: number,
    volume: number,
    filterType: BiquadFilterType,
    frequency: number,
  ): void {
    if (!this.noise) return;
    const source = ctx.createBufferSource();
    source.buffer = this.noise;
    const filter = ctx.createBiquadFilter();
    filter.type = filterType;
    filter.frequency.value = frequency;
    const gain = envelope(ctx, at, 0.002, duration, volume);
    source.connect(filter).connect(gain).connect(out);
    source.start(at);
    source.stop(at + duration + 0.02);
  }
}

/** A plain oscillator note that fades out over `duration`. */
function tone(
  ctx: AudioContext,
  out: AudioNode,
  type: OscillatorType,
  frequency: number,
  at: number,
  duration: number,
  volume: number,
): void {
  const osc = ctx.createOscillator();
  osc.type = type;
  osc.frequency.value = frequency;
  const gain = envelope(ctx, at, 0.005, duration, volume);
  osc.connect(gain).connect(out);
  osc.start(at);
  osc.stop(at + duration + 0.02);
}

/** A gain node that rises to `volume` over `attack` and fades to silence by `duration`. */
function envelope(
  ctx: AudioContext,
  at: number,
  attack: number,
  duration: number,
  volume: number,
): GainNode {
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0, at);
  gain.gain.linearRampToValueAtTime(volume, at + attack);
  // Exponential ramps can't reach 0, so fade to almost nothing.
  gain.gain.exponentialRampToValueAtTime(0.0001, at + duration);
  return gain;
}

/**
 * Safari's Audio Session API (iOS 16.4+). Not in TypeScript's DOM types yet,
 * so it is described here.
 */
interface NavigatorWithAudioSession {
  audioSession?: { type: string };
}

/**
 * By default iOS treats Web Audio like a ringtone, so the ring/silent switch
 * mutes it. Declaring the page's audio as "playback" (like a music player)
 * keeps the game audible. Older iOS versions just ignore this.
 */
function playEvenWhenSilenced(): void {
  const session = (navigator as NavigatorWithAudioSession).audioSession;
  if (session) session.type = 'playback';
}

/**
 * Plays one silent sample. Starting a sound inside the user gesture is what
 * finally wakes Web Audio up on some iOS versions.
 */
function playSilence(ctx: AudioContext): void {
  const source = ctx.createBufferSource();
  source.buffer = ctx.createBuffer(1, 1, ctx.sampleRate);
  source.connect(ctx.destination);
  source.start(0);
}

/** One second of white noise, reused by every noisy sound. */
function createNoiseBuffer(ctx: AudioContext): AudioBuffer {
  const buffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const samples = buffer.getChannelData(0);
  for (let i = 0; i < samples.length; i++) samples[i] = Math.random() * 2 - 1;
  return buffer;
}
