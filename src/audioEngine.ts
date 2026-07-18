/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { LofiPreset } from './types';

// Procedural sound generators
export function createHissBuffer(audioCtx: BaseAudioContext, duration: number = 6): AudioBuffer {
  const sampleRate = audioCtx.sampleRate;
  const numSamples = sampleRate * duration;
  const buffer = audioCtx.createBuffer(1, numSamples, sampleRate);
  const data = buffer.getChannelData(0);
  
  // White noise
  for (let i = 0; i < numSamples; i++) {
    data[i] = Math.random() * 2 - 1;
  }
  return buffer;
}

export function createCrackleBuffer(audioCtx: BaseAudioContext, duration: number = 8): AudioBuffer {
  const sampleRate = audioCtx.sampleRate;
  const numSamples = sampleRate * duration;
  const buffer = audioCtx.createBuffer(1, numSamples, sampleRate);
  const data = buffer.getChannelData(0);
  
  // Create a base of low-frequency surface rumble + random clicks/pops
  for (let i = 0; i < numSamples; i++) {
    // Soft low-frequency noise
    let noise = (Math.random() * 2 - 1) * 0.005;
    data[i] = noise;
  }

  // Inject random sharp dust clicks
  // Number of clicks depends on duration
  const clickCount = duration * 15; // 15 clicks per second average
  for (let c = 0; c < clickCount; c++) {
    const pos = Math.floor(Math.random() * numSamples);
    const clickAmplitude = (Math.random() * 0.35 + 0.05) * (Math.random() > 0.5 ? 1 : -1);
    const decay = Math.random() * 0.1 + 0.02; // decay speed
    const durationSamples = Math.floor(Math.random() * 80) + 20;

    for (let j = 0; j < durationSamples && (pos + j) < numSamples; j++) {
      // Exponentially decaying click
      data[pos + j] += clickAmplitude * Math.exp(-j * decay);
    }
  }

  return buffer;
}

// Math.tanh soft-clipping saturation curve
export function getSaturationCurve(drive: number): Float32Array {
  const n_samples = 44100;
  const curve = new Float32Array(n_samples);
  // drive ranges from 0 to 100. Factor capped at 6 (was 12) so the curve stays
  // musical tape warmth instead of folding into fuzz-pedal hard clipping.
  const factor = 1 + (drive / 100) * 5;
  for (let i = 0; i < n_samples; i++) {
    const x = (i * 2) / n_samples - 1;
    // Saturation using hyperbolic tangent (natural soft compression)
    curve[i] = Math.tanh(x * factor) / Math.tanh(factor);
  }
  return curve;
}

// Quantizes amplitude into a fixed number of steps to simulate low bit-depth
// hardware (cassette decks, 8-bit samplers). At bitDepth=16 this is transparent.
export function getBitcrushCurve(bitDepth: number): Float32Array {
  const steps = Math.pow(2, Math.max(2, Math.min(16, bitDepth)));
  const n_samples = 44100;
  const curve = new Float32Array(n_samples);
  for (let i = 0; i < n_samples; i++) {
    const x = (i * 2) / n_samples - 1;
    curve[i] = Math.round((x * steps) / 2) / (steps / 2);
  }
  return curve;
}

export interface LoudnessInfo {
  peak: number;
  rms: number;
}

// Strides through the full buffer (not just the intro) so a quiet outro or a
// hot chorus can't skew the reading — cost stays bounded on long files.
export function analyzeLoudness(buffer: AudioBuffer): LoudnessInfo {
  const numChannels = buffer.numberOfChannels;
  const maxSamplesPerChannel = 500000;
  let peak = 0;
  let sumSquares = 0;
  let count = 0;

  for (let c = 0; c < numChannels; c++) {
    const data = buffer.getChannelData(c);
    const stride = Math.max(1, Math.floor(data.length / maxSamplesPerChannel));
    for (let i = 0; i < data.length; i += stride) {
      const value = data[i];
      const absValue = Math.abs(value);
      if (absValue > peak) peak = absValue;
      sumSquares += value * value;
      count++;
    }
  }

  const rms = count > 0 ? Math.sqrt(sumSquares / count) : 0;
  return { peak, rms };
}

// Noise texture scaling: kept deliberately subtle. These were 0.25/0.08,
// which read as "ugly grain" once input normalization made music quieter
// relative to the fixed-level noise beds.
export const CRACKLE_GAIN_SCALE = 0.09;
export const HISS_GAIN_SCALE = 0.03;
// Gentle post-mix makeup gain into the soft-knee limiter for a polished,
// present output level closer to published lofi edits.
export const OUTPUT_MAKEUP_GAIN = 1.3;

const TARGET_RMS = 0.11; // moderate reference level (~-19 dBFS) for consistent DSP coloration
const MAX_INPUT_GAIN = 4.0; // +12dB ceiling, protects quiet recordings from noise-floor amplification
const MIN_INPUT_GAIN = 0.25; // -12dB floor, protects hot masters from being crushed too far

// Normalizes every track to the same working level BEFORE saturation/EQ so the
// lofi character sounds consistent whether the source is a quiet acoustic
// recording or an already-loud, heavily mastered pop track.
export function computeInputGain(loudness: LoudnessInfo): number {
  if (loudness.rms <= 0.0001) return 1.0;

  let gain = TARGET_RMS / loudness.rms;
  gain = Math.max(MIN_INPUT_GAIN, Math.min(MAX_INPUT_GAIN, gain));

  // Safety: never let the compensated peak get close to clipping before it
  // even reaches the saturation stage.
  const projectedPeak = loudness.peak * gain;
  if (projectedPeak > 0.98) {
    gain *= 0.98 / projectedPeak;
  }

  return gain;
}

// Generate an elegant, warm exponential decay stereo impulse response buffer for lush spatial reverb
export function createReverbImpulseResponse(ctx: BaseAudioContext, duration: number, decay: number): AudioBuffer {
  const sampleRate = ctx.sampleRate;
  const length = Math.max(100, Math.floor(sampleRate * duration));
  const impulse = ctx.createBuffer(2, length, sampleRate);
  const left = impulse.getChannelData(0);
  const right = impulse.getChannelData(1);

  for (let i = 0; i < length; i++) {
    const percent = i / length;
    // Exponential decay curve
    const envelope = Math.pow(1 - percent, decay);
    
    // Warm stereo random white noise
    const noiseL = Math.random() * 2 - 1;
    const noiseR = Math.random() * 2 - 1;
    
    // Roll-off higher frequencies more and more as the reverb decays (makes it extremely warm and cozy, "touching the soul")
    const rollOff = 1.0 - percent * 0.85;
    
    left[i] = noiseL * envelope * rollOff;
    right[i] = noiseR * envelope * rollOff;
  }

  return impulse;
}

// Generate a micro-impulse response buffer to simulate vintage microphone characteristics
export function createMicImpulseResponse(ctx: BaseAudioContext, profile: 'none' | 'ribbon' | 'tube' | 'carbon' | 'dynamic'): AudioBuffer {
  const sampleRate = ctx.sampleRate;
  // Short impulse response (around 23ms is 1024 samples)
  const length = 1024;
  const impulse = ctx.createBuffer(2, length, sampleRate);
  const left = impulse.getChannelData(0);
  const right = impulse.getChannelData(1);

  for (let i = 0; i < length; i++) {
    const t = i / sampleRate;

    // Default: identity (flat) response
    let valL = 0;
    let valR = 0;

    if (i === 0) {
      valL = 1.0;
      valR = 1.0;
    }

    if (profile === 'ribbon') {
      // RCA 44BX style: warm ribbon
      // Smooth transient (spread over 3-4 samples) + strong low frequency resonance (120Hz) + fast high decay
      const lowRes = Math.sin(2 * Math.PI * 120 * t) * Math.exp(-i * 0.01) * 0.15;
      const noise = (Math.random() * 2 - 1) * Math.exp(-i * 0.15) * 0.03;
      
      // Slight smooth spread on main pulse (low-pass feel)
      let pulse = 0;
      if (i === 0) pulse = 0.5;
      if (i === 1) pulse = 0.35;
      if (i === 2) pulse = 0.15;

      valL = pulse + lowRes + noise;
      valR = pulse + lowRes + noise;
    } else if (profile === 'tube') {
      // Vintage Tube Neumann style: high-frequency silkiness + warm low-mids
      // Crisp transient, plus presence boost around 5.2kHz and body around 220Hz
      const highSilk = Math.sin(2 * Math.PI * 5200 * t) * Math.exp(-i * 0.08) * 0.12;
      const lowBody = Math.sin(2 * Math.PI * 220 * t) * Math.exp(-i * 0.015) * 0.08;
      const noise = (Math.random() * 2 - 1) * Math.exp(-i * 0.12) * 0.02;

      let pulse = 0;
      if (i === 0) pulse = 0.8;
      if (i === 1) pulse = 0.15;
      if (i === 2) pulse = 0.05;

      valL = pulse + highSilk + lowBody + noise;
      valR = pulse + highSilk + lowBody + noise;
    } else if (profile === 'carbon') {
      // 1920s Telephone/Western Electric style: extreme mid range bandpass (800Hz - 2.5kHz)
      // Highly resonant peak at 1.3kHz, no low end, gritty capsule resonance
      const highRes = Math.sin(2 * Math.PI * 1300 * t) * Math.exp(-i * 0.02) * 0.4;
      const grittiness = (Math.random() * 2 - 1) * Math.exp(-i * 0.04) * 0.08;
      
      // Dipole low-cut (subtract adjacent sample to act as highpass)
      let pulse = 0;
      if (i === 0) pulse = 0.4;
      if (i === 1) pulse = -0.35; // highpass filter action!

      valL = pulse + highRes + grittiness;
      valR = pulse + highRes + grittiness;
    } else if (profile === 'dynamic') {
      // Vintage 1960s Dynamic (Shure 55 style): Present mids + slight low end roll-off
      // Presence peak around 3.5kHz, warmth around 180Hz
      const midPresence = Math.sin(2 * Math.PI * 3500 * t) * Math.exp(-i * 0.06) * 0.18;
      const warmth = Math.sin(2 * Math.PI * 180 * t) * Math.exp(-i * 0.01) * 0.05;

      let pulse = 0;
      if (i === 0) pulse = 0.7;
      if (i === 1) pulse = -0.15; // mild highpass
      if (i === 2) pulse = 0.1;

      valL = pulse + midPresence + warmth;
      valR = pulse + midPresence + warmth;
    }

    left[i] = valL;
    right[i] = valR;
  }

  // Normalize the entire buffer to avoid massive gain spikes
  normalizeBuffer(impulse);

  return impulse;
}

// Simple helper to normalize impulse responses
function normalizeBuffer(buffer: AudioBuffer) {
  const numChannels = buffer.numberOfChannels;
  let maxVal = 0;

  for (let c = 0; c < numChannels; c++) {
    const data = buffer.getChannelData(c);
    for (let i = 0; i < data.length; i++) {
      const absVal = Math.abs(data[i]);
      if (absVal > maxVal) {
        maxVal = absVal;
      }
    }
  }

  if (maxVal > 0) {
    for (let c = 0; c < numChannels; c++) {
      const data = buffer.getChannelData(c);
      for (let i = 0; i < data.length; i++) {
        data[i] /= maxVal;
      }
    }
  }
}

export interface VocalGenderEstimate {
  gender: 'female' | 'male' | 'unknown';
  medianF0: number | null;
  voicedRatio: number;
}

// Estimates whether the dominant vocal is female or male by tracking the
// fundamental frequency of the center (mid) signal, where lead vocals are
// typically panned. Heuristic: female vocals cluster around 165-255Hz,
// male around 85-155Hz. Works on typical mixes; callers should keep a
// manual override since instrumental-heavy tracks can fool it.
export function detectVocalGender(buffer: AudioBuffer): VocalGenderEstimate {
  const numChannels = buffer.numberOfChannels;
  const srcRate = buffer.sampleRate;
  const decimate = 4; // ~11kHz analysis rate is plenty for F0 <= 400Hz
  const sr = srcRate / decimate;
  const maxSeconds = 60;
  const totalSamples = Math.min(buffer.length, srcRate * maxSeconds);
  const monoLen = Math.floor(totalSamples / decimate);
  if (monoLen < sr) return { gender: 'unknown', medianF0: null, voicedRatio: 0 };

  const chans: Float32Array[] = [];
  for (let c = 0; c < numChannels; c++) chans.push(buffer.getChannelData(c));

  // Mid (center) mix with a one-pole highpass (~70Hz) to keep sub-bass from
  // dominating the periodicity estimate.
  const mono = new Float32Array(monoLen);
  const rc = 1 / (2 * Math.PI * 70);
  const dt = 1 / sr;
  const alpha = rc / (rc + dt);
  let prevX = 0;
  let prevY = 0;
  for (let i = 0; i < monoLen; i++) {
    let sum = 0;
    const idx = i * decimate;
    for (let c = 0; c < numChannels; c++) sum += chans[c][idx];
    const x = sum / numChannels;
    const y = alpha * (prevY + x - prevX);
    prevX = x;
    prevY = y;
    mono[i] = y;
  }

  const windowSize = 1024;
  const hop = 512;
  const minLag = Math.floor(sr / 400); // 400Hz ceiling
  const maxLag = Math.ceil(sr / 85);   // 85Hz floor
  const freqs: number[] = [];
  let windowCount = 0;

  for (let start = 0; start + windowSize + maxLag < monoLen; start += hop) {
    windowCount++;

    let r0 = 0;
    for (let i = 0; i < windowSize; i++) {
      const v = mono[start + i];
      r0 += v * v;
    }
    const rms = Math.sqrt(r0 / windowSize);
    if (rms < 0.01 || r0 <= 0) continue; // skip silence / near-silence

    let bestLag = -1;
    let bestCorr = 0;
    for (let lag = minLag; lag <= maxLag; lag++) {
      let sum = 0;
      for (let i = 0; i < windowSize; i++) {
        sum += mono[start + i] * mono[start + i + lag];
      }
      if (sum > bestCorr) {
        bestCorr = sum;
        bestLag = lag;
      }
    }

    // Only trust strongly periodic windows (voiced speech/singing)
    if (bestLag > 0 && bestCorr / r0 > 0.55) {
      freqs.push(sr / bestLag);
    }
  }

  const voicedRatio = windowCount > 0 ? freqs.length / windowCount : 0;
  if (freqs.length < 10) return { gender: 'unknown', medianF0: null, voicedRatio };

  freqs.sort((a, b) => a - b);
  const medianF0 = freqs[Math.floor(freqs.length / 2)];

  let gender: 'female' | 'male' | 'unknown' = 'unknown';
  if (medianF0 >= 165) gender = 'female';
  else if (medianF0 <= 145) gender = 'male';

  return { gender, medianF0, voicedRatio };
}

// Time-Domain Overlap-Add Pitch Shifter using complementary linear delay crossfades
export class TimeDomainPitchShifter {
  private ctx: BaseAudioContext;
  public input: GainNode;
  public output: GainNode;
  private delay1: DelayNode;
  private delay2: DelayNode;
  private gain1: GainNode;
  private gain2: GainNode;
  private modOsc: OscillatorNode;
  private shiftNode: WaveShaperNode;
  private gain1Mod: GainNode;
  private gain2Mod: GainNode;
  private gain1Shaper: WaveShaperNode;
  private gain2Shaper: WaveShaperNode;

  constructor(ctx: BaseAudioContext) {
    this.ctx = ctx;
    this.input = ctx.createGain();
    this.output = ctx.createGain();

    this.delay1 = ctx.createDelay(1.0);
    this.delay2 = ctx.createDelay(1.0);

    // Initial base delay of 22.5ms (keeps delay positive)
    this.delay1.delayTime.value = 0.0225;
    this.delay2.delayTime.value = 0.0225;

    this.gain1 = ctx.createGain();
    this.gain2 = ctx.createGain();

    this.modOsc = ctx.createOscillator();
    this.modOsc.type = 'sawtooth';

    // WaveShaper to shift the sawtooth phase by 180 degrees
    this.shiftNode = ctx.createWaveShaper();
    const shiftCurve = new Float32Array(1024);
    for (let i = 0; i < 1024; i++) {
      const x = (i / 1023) * 2 - 1;
      shiftCurve[i] = x < 0 ? (x + 1.0) : (x - 1.0);
    }
    this.shiftNode.curve = shiftCurve;

    // Modulator scaling gains
    this.gain1Mod = ctx.createGain();
    this.gain2Mod = ctx.createGain();
    
    // Default modulation depth (17.5ms = 0.0175s)
    this.gain1Mod.gain.value = 0.0175;
    this.gain2Mod.gain.value = 0.0175;

    // Crossfade windows — raised-cosine (Hann) rather than a linear triangle.
    // A linear crossfade has a discontinuous derivative at its peak, which is
    // audible as a "zipper"/robotic warble; the smooth cosine shape removes it.
    this.gain1Shaper = ctx.createWaveShaper();
    const curve1 = new Float32Array(1024);
    for (let i = 0; i < 1024; i++) {
      const x = (i / 1023) * 2 - 1;
      curve1[i] = 0.5 * (1 + Math.cos(x * Math.PI));
    }
    this.gain1Shaper.curve = curve1;

    this.gain2Shaper = ctx.createWaveShaper();
    const curve2 = new Float32Array(1024);
    for (let i = 0; i < 1024; i++) {
      const x = (i / 1023) * 2 - 1;
      curve2[i] = 0.5 * (1 - Math.cos(x * Math.PI));
    }
    this.gain2Shaper.curve = curve2;

    // Connections
    // Audio path
    this.input.connect(this.delay1);
    this.input.connect(this.delay2);

    this.delay1.connect(this.gain1);
    this.delay2.connect(this.gain2);

    this.gain1.connect(this.output);
    this.gain2.connect(this.output);

    // Modulation path
    this.modOsc.connect(this.gain1Mod);
    this.gain1Mod.connect(this.delay1.delayTime);

    this.modOsc.connect(this.shiftNode);
    this.shiftNode.connect(this.gain2Mod);
    this.gain2Mod.connect(this.delay2.delayTime);

    // Crossfade path
    this.modOsc.connect(this.gain1Shaper);
    this.gain1Shaper.connect(this.gain1.gain);

    this.modOsc.connect(this.gain2Shaper);
    this.gain2Shaper.connect(this.gain2.gain);

    // Start oscillator
    this.modOsc.start();
  }

  public setPitch(semitones: number) {
    if (semitones === 0) {
      // Bypass / zero modulation state
      this.gain1Mod.gain.value = 0;
      this.gain2Mod.gain.value = 0;
      this.modOsc.frequency.value = 0;
      return;
    }

    const s = Math.pow(2, semitones / 12);
    // Narrower sweep (was 35ms) shortens the delay distance between the two
    // crossfading taps, reducing the comb-filtering/"robotic" coloration that
    // is most audible on harmonically rich material like vocals.
    const tSweep = 0.028;
    const fLfo = Math.abs(1 - s) / tSweep;

    // Clip frequency to reasonable ranges to prevent instability
    const targetFreq = Math.min(Math.max(fLfo, 0.5), 150);
    this.modOsc.frequency.value = targetFreq;

    // If pitching up (semitones > 0), sweep needs to be descending (invert sawtooth)
    const sweepDepth = semitones > 0 ? -(tSweep / 2) : tSweep / 2;
    this.gain1Mod.gain.value = sweepDepth;
    this.gain2Mod.gain.value = sweepDepth;
  }

  public disconnect() {
    try {
      this.modOsc.stop();
    } catch (e) {}
    this.input.disconnect();
    this.output.disconnect();
    this.delay1.disconnect();
    this.delay2.disconnect();
    this.gain1.disconnect();
    this.gain2.disconnect();
    this.modOsc.disconnect();
    this.shiftNode.disconnect();
    this.gain1Mod.disconnect();
    this.gain2Mod.disconnect();
    this.gain1Shaper.disconnect();
    this.gain2Shaper.disconnect();
  }
}

// WAV encoding helper
export function bufferToWav(buffer: AudioBuffer): Blob {
  const numChannels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const format = 1; // Uncompressed LPCM
  const bitDepth = 16;
  
  const resultChannelData: Float32Array[] = [];
  let numSamples = buffer.length;
  for (let c = 0; c < numChannels; c++) {
    resultChannelData.push(buffer.getChannelData(c));
  }
  
  const bytesPerSample = bitDepth / 8;
  const blockAlign = numChannels * bytesPerSample;
  
  const bufferLength = numSamples * blockAlign;
  const headerLength = 44;
  const totalLength = headerLength + bufferLength;
  
  const arrayBuffer = new ArrayBuffer(totalLength);
  const view = new DataView(arrayBuffer);
  
  // Write WAV Header
  writeString(view, 0, 'RIFF');
  view.setUint32(4, 36 + bufferLength, true); // Size of entire file minus 8 bytes
  writeString(view, 8, 'WAVE');
  
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true); // fmt chunk size
  view.setUint16(20, format, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true); // Byte rate
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitDepth, true);
  
  writeString(view, 36, 'data');
  view.setUint32(40, bufferLength, true); // data chunk size
  
  // Write float PCM audio samples as 16-bit signed integers
  let offset = 44;
  for (let i = 0; i < numSamples; i++) {
    for (let c = 0; c < numChannels; c++) {
      let sample = resultChannelData[c][i];
      // Hard clipping guard
      sample = Math.max(-1, Math.min(1, sample));
      // Convert float [-1, 1] to signed 16-bit integer [-32768, 32767]
      const intSample = sample < 0 ? sample * 0x8000 : sample * 0x7FFF;
      view.setInt16(offset, intSample, true);
      offset += 2;
    }
  }
  
  return new Blob([view], { type: 'audio/wav' });
}

function writeString(view: DataView, offset: number, str: string) {
  for (let i = 0; i < str.length; i++) {
    view.setUint8(offset + i, str.charCodeAt(i));
  }
}

// Centralized Audio Manager for Live Preview
export class LofiAudioManager {
  private ctx: AudioContext | null = null;
  private sourceNode: AudioBufferSourceNode | null = null;
  private currentBuffer: AudioBuffer | null = null;
  
  // Live Node References
  private mainGain: GainNode | null = null;
  private bypassGainNode: GainNode | null = null;
  private isBypassed: boolean = false;
  private filterNode: BiquadFilterNode | null = null;
  private saturationNode: WaveShaperNode | null = null;
  private bitcrushNode: WaveShaperNode | null = null;
  private inputGainNode: GainNode | null = null;
  private inputGain: number = 1.0;
  private delayNode: DelayNode | null = null;
  private delayGainNode: GainNode | null = null;
  
  // Pitch Wobble (LFOs)
  private wowOsc: OscillatorNode | null = null;
  private wowGain: GainNode | null = null;
  private flutterOsc: OscillatorNode | null = null;
  private flutterGain: GainNode | null = null;

  // Noise sources
  private crackleSource: AudioBufferSourceNode | null = null;
  private crackleGain: GainNode | null = null;
  private hissSource: AudioBufferSourceNode | null = null;
  private hissGain: GainNode | null = null;
  private hissFilter: BiquadFilterNode | null = null;

  // Stereo Width nodes (split-merge-crossmix)
  private widthLeftGain1: GainNode | null = null;
  private widthLeftGain2: GainNode | null = null;
  private widthRightGain1: GainNode | null = null;
  private widthRightGain2: GainNode | null = null;

  // Visualizer Analyser
  public analyserNode: AnalyserNode | null = null;

  private startTime: number = 0;
  private pauseOffset: number = 0;
  private progressCallback: ((time: number) => void) | null = null;
  private animationFrameId: number | null = null;
  private currentSemitones: number = 0;

  // Brick-wall limiter and sync options
  private limiterNode: DynamicsCompressorNode | null = null;
  private tempoMatchEnabled: boolean = false;
  private tempoMatchRatio: number = 1.0;
  private pitchCorrectionEnabled: boolean = false;
  private pitchCorrectionCents: number = 0;

  // Vocal Gender / Formant Shifter options
  private vocalMode: 'off' | 'female-to-male' | 'male-to-female' = 'off';
  private vocalPitchShift: number = 0;
  // When true, the in-chain pitch shifter counteracts the preset's semitone
  // drop so the singer keeps their original voice while tempo still slows —
  // prevents female vocals from reading as male on pitched-down presets.
  private preserveVocalPitch: boolean = false;
  private vocalLowPeakingNode: BiquadFilterNode | null = null;
  private vocalHighPeakingNode: BiquadFilterNode | null = null;
  private vocalAirShelfNode: BiquadFilterNode | null = null;
  private vocalPitchShifter: TimeDomainPitchShifter | null = null;

  // Reverb and multi-band separation EQ nodes
  private reverbNode: ConvolverNode | null = null;
  private reverbGain: GainNode | null = null;
  private reverbSendFilter: BiquadFilterNode | null = null;
  private eqLowShelf: BiquadFilterNode | null = null;
  private eqMidCut: BiquadFilterNode | null = null;
  private eqHighShelf: BiquadFilterNode | null = null;

  // Bass and Jazz EQ nodes
  private eqBassBoost: BiquadFilterNode | null = null;
  private eqJazzColorPeaking: BiquadFilterNode | null = null;
  private eqJazzColorHighShelf: BiquadFilterNode | null = null;

  // Vintage Microphone Convolution nodes
  private micConvolverNode: ConvolverNode | null = null;
  private micDryGainNode: GainNode | null = null;
  private micWetGainNode: GainNode | null = null;

  constructor() {
    // Intentionally lazy-loaded to prevent browser autoplay blocks
  }

  public init() {
    if (!this.ctx) {
      this.ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      this.analyserNode = this.ctx.createAnalyser();
      this.analyserNode.fftSize = 256;
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  public isInitialized() {
    return !!this.ctx;
  }

  public setBuffer(buffer: AudioBuffer) {
    this.currentBuffer = buffer;
    this.pauseOffset = 0;
    // Normalize incoming loudness so the DSP chain colors every track
    // consistently instead of barely touching quiet masters and overdriving hot ones.
    this.inputGain = computeInputGain(analyzeLoudness(buffer));
  }

  public getBuffer() {
    return this.currentBuffer;
  }

  public setBypassed(bypassed: boolean) {
    this.isBypassed = bypassed;
    if (this.ctx) {
      const t = this.ctx.currentTime;
      if (this.mainGain && this.bypassGainNode) {
        if (bypassed) {
          // Switch to original dry version
          this.mainGain.gain.setTargetAtTime(0, t, 0.05);
          this.bypassGainNode.gain.setTargetAtTime(1.0, t, 0.05);
        } else {
          // Switch back to processed lofi
          this.mainGain.gain.setTargetAtTime(1.0, t, 0.05);
          this.bypassGainNode.gain.setTargetAtTime(0, t, 0.05);
        }
      }
    }
  }

  public getBypassed(): boolean {
    return this.isBypassed;
  }

  private getPlaybackRate(semitones: number): number {
    const totalSemitones = semitones;
    const semitoneRate = Math.pow(2, totalSemitones / 12);
    const pitchCorrRate = this.pitchCorrectionEnabled ? Math.pow(2, this.pitchCorrectionCents / 1200) : 1.0;
    const tempoMatchRate = this.tempoMatchEnabled ? this.tempoMatchRatio : 1.0;
    return semitoneRate * pitchCorrRate * tempoMatchRate;
  }

  public getCurrentTime() {
    if (!this.sourceNode || !this.ctx) return this.pauseOffset;
    const rate = this.getPlaybackRate(this.currentSemitones);
    return (this.ctx.currentTime - this.startTime) * rate + this.pauseOffset;
  }

  public setTempoMatch(enabled: boolean, ratio: number) {
    this.tempoMatchEnabled = enabled;
    this.tempoMatchRatio = ratio;
    if (this.sourceNode && this.ctx) {
      const finalRate = this.getPlaybackRate(this.currentSemitones);
      this.sourceNode.playbackRate.setTargetAtTime(finalRate, this.ctx.currentTime, 0.1);
    }
  }

  public setPitchCorrection(enabled: boolean, cents: number) {
    this.pitchCorrectionEnabled = enabled;
    this.pitchCorrectionCents = cents;
    if (this.sourceNode && this.ctx) {
      const finalRate = this.getPlaybackRate(this.currentSemitones);
      this.sourceNode.playbackRate.setTargetAtTime(finalRate, this.ctx.currentTime, 0.1);
    }
  }

  private getVocalShifterPitch(): number {
    const genderShift = this.vocalMode === 'off' ? 0 : this.vocalPitchShift;
    const preserveShift = this.preserveVocalPitch ? -this.currentSemitones : 0;
    return genderShift + preserveShift;
  }

  public setPreserveVocalPitch(enabled: boolean) {
    this.preserveVocalPitch = enabled;
    if (this.vocalPitchShifter) {
      this.vocalPitchShifter.setPitch(this.getVocalShifterPitch());
    }
  }

  public setVocalShifter(mode: 'off' | 'female-to-male' | 'male-to-female', pitchShift: number) {
    this.vocalMode = mode;
    this.vocalPitchShift = pitchShift;

    if (this.vocalPitchShifter) {
      this.vocalPitchShifter.setPitch(this.getVocalShifterPitch());
    }

    if (this.sourceNode && this.ctx) {
      const finalRate = this.getPlaybackRate(this.currentSemitones);
      this.sourceNode.playbackRate.setTargetAtTime(finalRate, this.ctx.currentTime, 0.1);
    }

    this.updateVocalFilters();
  }

  private updateVocalFilters() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    
    if (this.vocalLowPeakingNode && this.vocalHighPeakingNode && this.vocalAirShelfNode) {
      if (this.vocalMode === 'off') {
        this.vocalLowPeakingNode.gain.setTargetAtTime(0, t, 0.1);
        this.vocalHighPeakingNode.gain.setTargetAtTime(0, t, 0.1);
        this.vocalAirShelfNode.gain.setTargetAtTime(0, t, 0.1);
      } else if (this.vocalMode === 'female-to-male') {
        // Deep masculine chest resonance (boost low frequencies, cut sibilance).
        // Slightly stronger than before to compensate for the reduced raw pitch
        // shift (7 -> 5 semitones), which was lowered to reduce shifter artifacts.
        this.vocalLowPeakingNode.frequency.setTargetAtTime(140, t, 0.1);
        this.vocalLowPeakingNode.Q.setTargetAtTime(1.0, t, 0.1);
        this.vocalLowPeakingNode.gain.setTargetAtTime(10.0, t, 0.1);

        this.vocalHighPeakingNode.frequency.setTargetAtTime(3000, t, 0.1);
        this.vocalHighPeakingNode.Q.setTargetAtTime(0.8, t, 0.1);
        this.vocalHighPeakingNode.gain.setTargetAtTime(-10.0, t, 0.1);

        this.vocalAirShelfNode.frequency.setTargetAtTime(8000, t, 0.1);
        this.vocalAirShelfNode.gain.setTargetAtTime(-6.0, t, 0.1);
      } else if (this.vocalMode === 'male-to-female') {
        // Clear breathy feminine presence (high presence boost, low muddy resonance cut)
        this.vocalLowPeakingNode.frequency.setTargetAtTime(180, t, 0.1);
        this.vocalLowPeakingNode.Q.setTargetAtTime(1.5, t, 0.1);
        this.vocalLowPeakingNode.gain.setTargetAtTime(-11.0, t, 0.1);

        this.vocalHighPeakingNode.frequency.setTargetAtTime(3200, t, 0.1);
        this.vocalHighPeakingNode.Q.setTargetAtTime(1.2, t, 0.1);
        this.vocalHighPeakingNode.gain.setTargetAtTime(9.0, t, 0.1);

        this.vocalAirShelfNode.frequency.setTargetAtTime(8000, t, 0.1);
        this.vocalAirShelfNode.gain.setTargetAtTime(6.0, t, 0.1);
      }
    }
  }

  public setProgressCallback(cb: (time: number) => void) {
    this.progressCallback = cb;
  }

  public start(preset: LofiPreset, customOffset?: number) {
    this.init();
    if (!this.ctx || !this.currentBuffer) return;

    this.stopNodes();

    const playOffset = customOffset !== undefined ? customOffset : this.pauseOffset;
    if (playOffset >= this.currentBuffer.duration) {
      this.pauseOffset = 0;
      this.startTime = this.ctx.currentTime;
    } else {
      this.pauseOffset = playOffset;
    }

    this.startTime = this.ctx.currentTime;
    this.currentSemitones = preset.semitones;

    // Create the Main Node Graph
    this.sourceNode = this.ctx.createBufferSource();
    this.sourceNode.buffer = this.currentBuffer;

    // Set base playback speed according to semitone pitch shift, tempo match, and pitch correction
    const finalRate = this.getPlaybackRate(preset.semitones);
    this.sourceNode.playbackRate.value = finalRate;

    this.mainGain = this.ctx.createGain();
    this.mainGain.gain.value = this.isBypassed ? 0.0 : 1.0;

    // 1. Saturation
    this.saturationNode = this.ctx.createWaveShaper();
    this.saturationNode.curve = getSaturationCurve(preset.saturationDrive);
    this.saturationNode.oversample = '4x';

    // 1b. Bit-depth crunch (quantization) — makes the preset's bitDepth audible
    this.bitcrushNode = this.ctx.createWaveShaper();
    this.bitcrushNode.curve = getBitcrushCurve(preset.bitDepth);

    // 2. Stereo Width Controller (Split Left & Right, cross-mix)
    const splitter = this.ctx.createChannelSplitter(2);
    const merger = this.ctx.createChannelMerger(2);
    
    this.widthLeftGain1 = this.ctx.createGain(); // L to L
    this.widthLeftGain2 = this.ctx.createGain(); // L to R (cross-mix)
    this.widthRightGain1 = this.ctx.createGain(); // R to R
    this.widthRightGain2 = this.ctx.createGain(); // R to L (cross-mix)

    this.updateWidthNodes(preset.stereoWidth);

    // 3. Filter EQ
    this.filterNode = this.ctx.createBiquadFilter();
    this.filterNode.type = preset.filterType;
    this.filterNode.frequency.value = preset.filterCutoff;
    this.filterNode.Q.value = preset.filterQ;

    // 4. Delay / Echo Space
    this.delayNode = this.ctx.createDelay(2.0);
    this.delayNode.delayTime.value = preset.delayTime;
    
    this.delayGainNode = this.ctx.createGain();
    this.delayGainNode.gain.value = preset.delayFeedback / 100 * 0.6; // Scale down feedback to prevent runaway loop

    // Setup Delay Loop
    this.delayNode.connect(this.delayGainNode);
    this.delayGainNode.connect(this.delayNode); // feedback loop

    // 5. Wow & Flutter Pitch LFOs
    this.wowOsc = this.ctx.createOscillator();
    this.wowOsc.frequency.value = preset.wowFreq;
    this.wowGain = this.ctx.createGain();
    this.wowGain.gain.value = (preset.wowDepth / 100) * 0.004; // Max wobble ~0.4% playback speed drift

    this.flutterOsc = this.ctx.createOscillator();
    this.flutterOsc.frequency.value = preset.flutterFreq;
    this.flutterGain = this.ctx.createGain();
    this.flutterGain.gain.value = (preset.flutterDepth / 100) * 0.0015;

    // Connect LFOs to source playbackRate
    this.wowOsc.connect(this.wowGain);
    this.wowGain.connect(this.sourceNode.playbackRate);

    this.flutterOsc.connect(this.flutterGain);
    this.flutterGain.connect(this.sourceNode.playbackRate);

    // Start LFOs
    this.wowOsc.start();
    this.flutterOsc.start();

    // Initialize Vocal Shifter Nodes
    this.vocalLowPeakingNode = this.ctx.createBiquadFilter();
    this.vocalLowPeakingNode.type = 'peaking';
    this.vocalLowPeakingNode.frequency.value = 140;
    this.vocalLowPeakingNode.Q.value = 1.0;
    this.vocalLowPeakingNode.gain.value = 0;

    this.vocalHighPeakingNode = this.ctx.createBiquadFilter();
    this.vocalHighPeakingNode.type = 'peaking';
    this.vocalHighPeakingNode.frequency.value = 3000;
    this.vocalHighPeakingNode.Q.value = 0.8;
    this.vocalHighPeakingNode.gain.value = 0;

    this.vocalAirShelfNode = this.ctx.createBiquadFilter();
    this.vocalAirShelfNode.type = 'highshelf';
    this.vocalAirShelfNode.frequency.value = 8000;
    this.vocalAirShelfNode.gain.value = 0;

    // Apply active filter values
    this.updateVocalFilters();

    // Initialize Vintage Microphone Convolution Loader
    this.micConvolverNode = this.ctx.createConvolver();
    this.micConvolverNode.buffer = createMicImpulseResponse(this.ctx, preset.micProfile);

    this.micDryGainNode = this.ctx.createGain();
    this.micWetGainNode = this.ctx.createGain();

    const micWet = preset.micAmount / 100;
    const micDry = 1.0 - micWet;
    this.micWetGainNode.gain.setValueAtTime(micWet, this.ctx.currentTime);
    this.micDryGainNode.gain.setValueAtTime(micDry, this.ctx.currentTime);

    // Connect Source Graph
    this.vocalPitchShifter = new TimeDomainPitchShifter(this.ctx);
    this.vocalPitchShifter.setPitch(this.getVocalShifterPitch());

    this.inputGainNode = this.ctx.createGain();
    this.inputGainNode.gain.value = this.inputGain;

    this.sourceNode.connect(this.inputGainNode);
    this.inputGainNode.connect(this.vocalLowPeakingNode);
    this.vocalLowPeakingNode.connect(this.vocalHighPeakingNode);
    this.vocalHighPeakingNode.connect(this.vocalAirShelfNode);
    this.vocalAirShelfNode.connect(this.vocalPitchShifter.input);

    // Split after vocal pitch shifter to dry and wet microphone paths
    this.vocalPitchShifter.output.connect(this.micDryGainNode);
    this.micDryGainNode.connect(this.saturationNode);

    this.vocalPitchShifter.output.connect(this.micConvolverNode);
    this.micConvolverNode.connect(this.micWetGainNode);
    this.micWetGainNode.connect(this.saturationNode);

    this.saturationNode.connect(this.bitcrushNode);
    this.bitcrushNode.connect(splitter);

    // Split Left/Right and cross mix
    splitter.connect(this.widthLeftGain1, 0); // Left channel out
    splitter.connect(this.widthLeftGain2, 0); // Left channel to Right channel mix
    splitter.connect(this.widthRightGain1, 1); // Right channel out
    splitter.connect(this.widthRightGain2, 1); // Right channel to Left channel mix

    // Merge Left
    this.widthLeftGain1.connect(merger, 0, 0);
    this.widthRightGain2.connect(merger, 0, 0);

    // Merge Right
    this.widthRightGain1.connect(merger, 0, 1);
    this.widthLeftGain2.connect(merger, 0, 1);

    // Connect merged stereo to Filter EQ
    merger.connect(this.filterNode);

    // Create separation/clarity EQ nodes
    this.eqLowShelf = this.ctx.createBiquadFilter();
    this.eqLowShelf.type = 'lowshelf';
    this.eqLowShelf.frequency.value = 80;

    this.eqMidCut = this.ctx.createBiquadFilter();
    this.eqMidCut.type = 'peaking';
    this.eqMidCut.frequency.value = 350;
    this.eqMidCut.Q.value = 0.5;

    this.eqHighShelf = this.ctx.createBiquadFilter();
    this.eqHighShelf.type = 'highshelf';
    this.eqHighShelf.frequency.value = 6000;

    // Create Bass and Jazz EQ nodes
    this.eqBassBoost = this.ctx.createBiquadFilter();
    this.eqBassBoost.type = 'lowshelf';
    this.eqBassBoost.frequency.value = 65;

    this.eqJazzColorPeaking = this.ctx.createBiquadFilter();
    this.eqJazzColorPeaking.type = 'peaking';
    this.eqJazzColorPeaking.frequency.value = 1500;
    this.eqJazzColorPeaking.Q.value = 0.55;

    this.eqJazzColorHighShelf = this.ctx.createBiquadFilter();
    this.eqJazzColorHighShelf.type = 'highshelf';
    this.eqJazzColorHighShelf.frequency.value = 4500;

    // Apply active EQ values
    this.updateEQNodes(preset.soulfulClarity);
    this.updateBassBoost(preset.bassBoost ?? 0);
    this.updateJazzColor(preset.jazzColor ?? 0);

    // Filter EQ feeds into Bass/Jazz/Clarity EQ chain
    this.filterNode.connect(this.eqBassBoost);
    this.eqBassBoost.connect(this.eqJazzColorPeaking);
    this.eqJazzColorPeaking.connect(this.eqJazzColorHighShelf);
    this.eqJazzColorHighShelf.connect(this.eqLowShelf);
    this.eqLowShelf.connect(this.eqMidCut);
    this.eqMidCut.connect(this.eqHighShelf);

    // Split Clarity EQ output to:
    // a) Main Dry gain path
    this.eqHighShelf.connect(this.mainGain);

    // b) Delay/Echo space
    this.eqHighShelf.connect(this.delayNode);
    this.delayGainNode.connect(this.mainGain); // Connect delay outputs to main gain

    // c) Soulful Reverb send (cuts low-end sub to keep drums clear!)
    this.reverbSendFilter = this.ctx.createBiquadFilter();
    this.reverbSendFilter.type = 'highpass';
    this.reverbSendFilter.frequency.value = 180; // keep bass and kick out of reverb!

    this.reverbNode = this.ctx.createConvolver();
    const duration = 0.5 + (preset.reverbSize / 100) * 3.0;
    const decay = 2.0 + (preset.reverbSize / 100) * 1.5;
    this.reverbNode.buffer = createReverbImpulseResponse(this.ctx, duration, decay);

    this.reverbGain = this.ctx.createGain();
    this.reverbGain.gain.value = (preset.reverbLevel / 100) * 0.45;

    // Connect Reverb send
    this.eqHighShelf.connect(this.reverbSendFilter);
    this.reverbSendFilter.connect(this.reverbNode);
    this.reverbNode.connect(this.reverbGain);
    this.reverbGain.connect(this.mainGain);

    // 6. Procedural Vinyl Crackle
    const crackleBuf = createCrackleBuffer(this.ctx);
    this.crackleSource = this.ctx.createBufferSource();
    this.crackleSource.buffer = crackleBuf;
    this.crackleSource.loop = true;
    
    this.crackleGain = this.ctx.createGain();
    this.crackleGain.gain.value = (preset.crackleLevel / 100) * CRACKLE_GAIN_SCALE;

    // Highpass the crackle at 500Hz so dust clicks read as vinyl texture
    // without adding low-end rumble (standard lofi mixing practice).
    const crackleHP = this.ctx.createBiquadFilter();
    crackleHP.type = 'highpass';
    crackleHP.frequency.value = 500;

    this.crackleSource.connect(crackleHP);
    crackleHP.connect(this.crackleGain);
    this.crackleGain.connect(this.mainGain);
    this.crackleSource.start();

    // 7. Procedural Tape Hiss
    const hissBuf = createHissBuffer(this.ctx);
    this.hissSource = this.ctx.createBufferSource();
    this.hissSource.buffer = hissBuf;
    this.hissSource.loop = true;

    this.hissFilter = this.ctx.createBiquadFilter();
    this.hissFilter.type = 'bandpass';
    this.hissFilter.frequency.value = 1800; // Classic warm tape bandpass mid-focus
    this.hissFilter.Q.value = 1.0;
    
    this.hissGain = this.ctx.createGain();
    this.hissGain.gain.value = (preset.hissLevel / 100) * HISS_GAIN_SCALE;

    this.hissSource.connect(this.hissFilter);
    this.hissFilter.connect(this.hissGain);
    this.hissGain.connect(this.mainGain);
    this.hissSource.start();

    // 8. Brick-Wall Limiter Node to prevent digital clipping
    this.limiterNode = this.ctx.createDynamicsCompressor();
    this.limiterNode.threshold.value = -1.0; // dB, extra headroom now input is normalized
    this.limiterNode.knee.value = 6.0; // soft knee avoids audible pumping on transients
    this.limiterNode.ratio.value = 20.0;
    this.limiterNode.attack.value = 0.005;
    this.limiterNode.release.value = 0.12;

    // Connect Main Gain through makeup gain and Limiter to Analyser and Destination
    const makeupGain = this.ctx.createGain();
    makeupGain.gain.value = OUTPUT_MAKEUP_GAIN;
    this.mainGain.connect(makeupGain);
    makeupGain.connect(this.limiterNode);

    // Bypass Path (Dry Original)
    this.bypassGainNode = this.ctx.createGain();
    this.bypassGainNode.gain.value = this.isBypassed ? 1.0 : 0.0;
    this.sourceNode.connect(this.bypassGainNode);
    this.bypassGainNode.connect(this.limiterNode);

    this.limiterNode.connect(this.analyserNode!);
    this.analyserNode!.connect(this.ctx.destination);

    // Play main song buffer
    this.sourceNode.start(0, this.pauseOffset);

    // Handle end of playback
    this.sourceNode.onended = () => {
      // Check if it ended naturally or was stopped manually
      if (this.ctx && this.sourceNode && this.getCurrentTime() >= this.currentBuffer!.duration - 0.1) {
        this.pauseOffset = 0;
        this.stopNodes();
        if (this.progressCallback) this.progressCallback(0);
      }
    };

    this.startTrackingProgress();
  }

  public pause() {
    if (!this.sourceNode || !this.ctx) return;
    this.pauseOffset = this.getCurrentTime();
    this.stopNodes();
  }

  public stop() {
    this.pauseOffset = 0;
    this.stopNodes();
  }

  private stopNodes() {
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }

    try {
      if (this.sourceNode) {
        this.sourceNode.stop();
        this.sourceNode.disconnect();
        this.sourceNode = null;
      }
      if (this.wowOsc) {
        this.wowOsc.stop();
        this.wowOsc.disconnect();
        this.wowOsc = null;
      }
      if (this.flutterOsc) {
        this.flutterOsc.stop();
        this.flutterOsc.disconnect();
        this.flutterOsc = null;
      }
      if (this.bitcrushNode) {
        this.bitcrushNode.disconnect();
        this.bitcrushNode = null;
      }
      if (this.inputGainNode) {
        this.inputGainNode.disconnect();
        this.inputGainNode = null;
      }
      if (this.crackleSource) {
        this.crackleSource.stop();
        this.crackleSource.disconnect();
        this.crackleSource = null;
      }
      if (this.hissSource) {
        this.hissSource.stop();
        this.hissSource.disconnect();
        this.hissSource = null;
      }
      if (this.vocalLowPeakingNode) {
        this.vocalLowPeakingNode.disconnect();
        this.vocalLowPeakingNode = null;
      }
      if (this.vocalHighPeakingNode) {
        this.vocalHighPeakingNode.disconnect();
        this.vocalHighPeakingNode = null;
      }
      if (this.vocalAirShelfNode) {
        this.vocalAirShelfNode.disconnect();
        this.vocalAirShelfNode = null;
      }
      if (this.vocalPitchShifter) {
        this.vocalPitchShifter.disconnect();
        this.vocalPitchShifter = null;
      }
      if (this.eqBassBoost) {
        this.eqBassBoost.disconnect();
        this.eqBassBoost = null;
      }
      if (this.eqJazzColorPeaking) {
        this.eqJazzColorPeaking.disconnect();
        this.eqJazzColorPeaking = null;
      }
      if (this.eqJazzColorHighShelf) {
        this.eqJazzColorHighShelf.disconnect();
        this.eqJazzColorHighShelf = null;
      }
      if (this.eqLowShelf) {
        this.eqLowShelf.disconnect();
        this.eqLowShelf = null;
      }
      if (this.eqMidCut) {
        this.eqMidCut.disconnect();
        this.eqMidCut = null;
      }
      if (this.eqHighShelf) {
        this.eqHighShelf.disconnect();
        this.eqHighShelf = null;
      }
      if (this.reverbNode) {
        this.reverbNode.disconnect();
        this.reverbNode = null;
      }
      if (this.reverbGain) {
        this.reverbGain.disconnect();
        this.reverbGain = null;
      }
      if (this.reverbSendFilter) {
        this.reverbSendFilter.disconnect();
        this.reverbSendFilter = null;
      }
      if (this.micConvolverNode) {
        this.micConvolverNode.disconnect();
        this.micConvolverNode = null;
      }
      if (this.micDryGainNode) {
        this.micDryGainNode.disconnect();
        this.micDryGainNode = null;
      }
      if (this.micWetGainNode) {
        this.micWetGainNode.disconnect();
        this.micWetGainNode = null;
      }
      if (this.bypassGainNode) {
        this.bypassGainNode.disconnect();
        this.bypassGainNode = null;
      }
    } catch (e) {
      // Nodes might already be stopped or inactive
    }
  }

  // Live sliders controller
  public updateParam(param: string, value: any) {
    if (!this.ctx) return;

    switch (param) {
      case 'semitones':
        this.currentSemitones = value;
        if (this.sourceNode) {
          const finalRate = this.getPlaybackRate(value);
          this.sourceNode.playbackRate.setTargetAtTime(finalRate, this.ctx.currentTime, 0.1);
        }
        if (this.vocalPitchShifter) {
          this.vocalPitchShifter.setPitch(this.getVocalShifterPitch());
        }
        break;
      case 'filterCutoff':
        if (this.filterNode) {
          // Smooth parameter change to avoid clicks
          this.filterNode.frequency.setTargetAtTime(value, this.ctx.currentTime, 0.05);
        }
        break;
      case 'filterQ':
        if (this.filterNode) {
          this.filterNode.Q.setTargetAtTime(value, this.ctx.currentTime, 0.05);
        }
        break;
      case 'saturationDrive':
        if (this.saturationNode) {
          this.saturationNode.curve = getSaturationCurve(value);
        }
        break;
      case 'wowDepth':
        if (this.wowGain) {
          this.wowGain.gain.setTargetAtTime((value / 100) * 0.004, this.ctx.currentTime, 0.1);
        }
        break;
      case 'crackleLevel':
        if (this.crackleGain) {
          this.crackleGain.gain.setTargetAtTime((value / 100) * CRACKLE_GAIN_SCALE, this.ctx.currentTime, 0.1);
        }
        break;
      case 'hissLevel':
        if (this.hissGain) {
          this.hissGain.gain.setTargetAtTime((value / 100) * HISS_GAIN_SCALE, this.ctx.currentTime, 0.1);
        }
        break;
      case 'delayFeedback':
        if (this.delayGainNode) {
          this.delayGainNode.gain.setTargetAtTime(value / 100 * 0.6, this.ctx.currentTime, 0.1);
        }
        break;
      case 'stereoWidth':
        this.updateWidthNodes(value);
        break;
      case 'reverbLevel':
        if (this.reverbGain) {
          this.reverbGain.gain.setTargetAtTime((value / 100) * 0.45, this.ctx.currentTime, 0.1);
        }
        break;
      case 'reverbSize':
        if (this.reverbNode && this.ctx) {
          const duration = 0.5 + (value / 100) * 3.0;
          const decay = 2.0 + (value / 100) * 1.5;
          try {
            this.reverbNode.buffer = createReverbImpulseResponse(this.ctx, duration, decay);
          } catch (e) {
            console.error("Error creating reverb buffer live:", e);
          }
        }
        break;
      case 'soulfulClarity':
        this.updateEQNodes(value);
        break;
      case 'bassBoost':
        this.updateBassBoost(value);
        break;
      case 'jazzColor':
        this.updateJazzColor(value);
        break;
      case 'micProfile':
        if (this.micConvolverNode && this.ctx) {
          try {
            this.micConvolverNode.buffer = createMicImpulseResponse(this.ctx, value);
          } catch (e) {
            console.error("Error creating mic buffer live:", e);
          }
        }
        break;
      case 'micAmount':
        if (this.micWetGainNode && this.micDryGainNode && this.ctx) {
          const t = this.ctx.currentTime;
          const micWet = value / 100;
          const micDry = 1.0 - micWet;
          this.micWetGainNode.gain.setTargetAtTime(micWet, t, 0.05);
          this.micDryGainNode.gain.setTargetAtTime(micDry, t, 0.05);
        }
        break;
      case 'bitDepth':
        if (this.bitcrushNode) {
          this.bitcrushNode.curve = getBitcrushCurve(value);
        }
        break;
    }
  }

  private updateEQNodes(value: number) {
    if (!this.ctx || !this.eqLowShelf || !this.eqMidCut || !this.eqHighShelf) return;
    const t = this.ctx.currentTime;
    // Low Shelf warm lift at 80Hz: up to +3.5dB
    this.eqLowShelf.gain.setTargetAtTime((value / 100) * 3.5, t, 0.1);
    // Mid Cut muddy boxiness scoop at 350Hz: down to -4.5dB
    this.eqMidCut.gain.setTargetAtTime(-(value / 100) * 4.5, t, 0.1);
    // High Shelf air & presence at 6000Hz: up to +3dB
    this.eqHighShelf.gain.setTargetAtTime((value / 100) * 3.0, t, 0.1);
  }

  private updateBassBoost(value: number) {
    if (!this.ctx || !this.eqBassBoost) return;
    const t = this.ctx.currentTime;
    // Boost up to +9.0 dB
    const dbBoost = (value / 100) * 9.0;
    this.eqBassBoost.gain.setTargetAtTime(dbBoost, t, 0.1);
  }

  private updateJazzColor(value: number) {
    if (!this.ctx || !this.eqJazzColorPeaking || !this.eqJazzColorHighShelf) return;
    const t = this.ctx.currentTime;
    // Boost sweet mids up to +4.5 dB
    this.eqJazzColorPeaking.gain.setTargetAtTime((value / 100) * 4.5, t, 0.1);
    // Cut harsh highs down to -5.0 dB for a cozy vintage feel
    this.eqJazzColorHighShelf.gain.setTargetAtTime(-(value / 100) * 5.0, t, 0.1);
  }

  private updateWidthNodes(width: number) {
    if (!this.ctx || !this.widthLeftGain1) return;
    
    // Width: 0 (mono) to 100 (stereo)
    const w = Math.max(0, Math.min(100, width)) / 100;
    
    // Smooth crossmix
    const diag = (1 + w) / 2;
    const cross = (1 - w) / 2;

    this.widthLeftGain1.gain.setTargetAtTime(diag, this.ctx.currentTime, 0.05);
    this.widthLeftGain2.gain.setTargetAtTime(cross, this.ctx.currentTime, 0.05);
    this.widthRightGain1.gain.setTargetAtTime(diag, this.ctx.currentTime, 0.05);
    this.widthRightGain2.gain.setTargetAtTime(cross, this.ctx.currentTime, 0.05);
  }

  private startTrackingProgress() {
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
    }

    const tick = () => {
      if (this.progressCallback && this.sourceNode) {
        const elapsed = this.getCurrentTime();
        this.progressCallback(Math.min(elapsed, this.currentBuffer?.duration || 0));
        this.animationFrameId = requestAnimationFrame(tick);
      }
    };
    this.animationFrameId = requestAnimationFrame(tick);
  }
}

// Offline/Export Rendering Engine
export async function renderLofiAudio(
  buffer: AudioBuffer,
  preset: LofiPreset,
  onProgress?: (progress: number) => void,
  tempoMatchEnabled: boolean = false,
  tempoMatchRatio: number = 1.0,
  pitchCorrectionEnabled: boolean = false,
  pitchCorrectionCents: number = 0,
  vocalMode: 'off' | 'female-to-male' | 'male-to-female' = 'off',
  vocalPitchShift: number = 0,
  preserveVocalPitch: boolean = false
): Promise<Blob> {
  const sampleRate = buffer.sampleRate;
  const totalSemitones = preset.semitones;
  const semitoneRate = Math.pow(2, totalSemitones / 12);
  const pitchCorrRate = pitchCorrectionEnabled ? Math.pow(2, pitchCorrectionCents / 1200) : 1.0;
  const tempoMatchRate = tempoMatchEnabled ? tempoMatchRatio : 1.0;
  const totalRate = semitoneRate * pitchCorrRate * tempoMatchRate;

  const duration = buffer.duration / totalRate; // actual playback duration
  const numChannels = buffer.numberOfChannels;

  // Create Offline Context
  const offlineCtx = new OfflineAudioContext(numChannels, sampleRate * duration, sampleRate);

  // Setup DSP chain exactly like the live context
  const source = offlineCtx.createBufferSource();
  source.buffer = buffer;
  source.playbackRate.value = totalRate;

  // Normalize loudness so exported renders match the live preview's consistency
  const loudness = analyzeLoudness(buffer);
  const inputGain = computeInputGain(loudness);
  const inputGainNode = offlineCtx.createGain();
  inputGainNode.gain.value = inputGain;

  const mainGain = offlineCtx.createGain();
  mainGain.gain.value = 1.0;

  // 1. Saturation
  const saturationNode = offlineCtx.createWaveShaper();
  saturationNode.curve = getSaturationCurve(preset.saturationDrive);
  saturationNode.oversample = '4x';

  // 1b. Bit-depth crunch (quantization)
  const bitcrushNode = offlineCtx.createWaveShaper();
  bitcrushNode.curve = getBitcrushCurve(preset.bitDepth);

  // 2. Width crossmixer
  const splitter = offlineCtx.createChannelSplitter(2);
  const merger = offlineCtx.createChannelMerger(2);

  const w = preset.stereoWidth / 100;
  const diag = (1 + w) / 2;
  const cross = (1 - w) / 2;

  const wL1 = offlineCtx.createGain(); wL1.gain.value = diag;
  const wL2 = offlineCtx.createGain(); wL2.gain.value = cross;
  const wR1 = offlineCtx.createGain(); wR1.gain.value = diag;
  const wR2 = offlineCtx.createGain(); wR2.gain.value = cross;

  // 3. Filter EQ
  const filterNode = offlineCtx.createBiquadFilter();
  filterNode.type = preset.filterType;
  filterNode.frequency.value = preset.filterCutoff;
  filterNode.Q.value = preset.filterQ;

  // 4. Delay / Echo Space
  const delayNode = offlineCtx.createDelay(2.0);
  delayNode.delayTime.value = preset.delayTime;
  const delayGainNode = offlineCtx.createGain();
  delayGainNode.gain.value = preset.delayFeedback / 100 * 0.6;

  delayNode.connect(delayGainNode);
  delayGainNode.connect(delayNode);

  // 5. Wow & Flutter Pitch LFOs
  const wowOsc = offlineCtx.createOscillator();
  wowOsc.frequency.value = preset.wowFreq;
  const wowGain = offlineCtx.createGain();
  wowGain.gain.value = (preset.wowDepth / 100) * 0.004;

  const flutterOsc = offlineCtx.createOscillator();
  flutterOsc.frequency.value = preset.flutterFreq;
  const flutterGain = offlineCtx.createGain();
  flutterGain.gain.value = (preset.flutterDepth / 100) * 0.0015;

  wowOsc.connect(wowGain);
  wowGain.connect(source.playbackRate);

  flutterOsc.connect(flutterGain);
  flutterGain.connect(source.playbackRate);

  // 6. Procedural Crackle Node
  const crackleBuf = createCrackleBuffer(offlineCtx, duration);
  const crackleSource = offlineCtx.createBufferSource();
  crackleSource.buffer = crackleBuf;
  crackleSource.loop = true;
  const crackleGain = offlineCtx.createGain();
  crackleGain.gain.value = (preset.crackleLevel / 100) * CRACKLE_GAIN_SCALE;

  const crackleHP = offlineCtx.createBiquadFilter();
  crackleHP.type = 'highpass';
  crackleHP.frequency.value = 500;

  crackleSource.connect(crackleHP);
  crackleHP.connect(crackleGain);
  crackleGain.connect(mainGain);

  // 7. Procedural Hiss Node
  const hissBuf = createHissBuffer(offlineCtx, duration);
  const hissSource = offlineCtx.createBufferSource();
  hissSource.buffer = hissBuf;
  hissSource.loop = true;
  const hissFilter = offlineCtx.createBiquadFilter();
  hissFilter.type = 'bandpass';
  hissFilter.frequency.value = 1800;
  hissFilter.Q.value = 1.0;
  const hissGain = offlineCtx.createGain();
  hissGain.gain.value = (preset.hissLevel / 100) * HISS_GAIN_SCALE;

  hissSource.connect(hissFilter);
  hissFilter.connect(hissGain);
  hissGain.connect(mainGain);

  // Create Vocal Formant Shaping Filters in Offline Context
  const vLow = offlineCtx.createBiquadFilter();
  vLow.type = 'peaking';
  vLow.frequency.value = 140;
  vLow.Q.value = 1.0;
  vLow.gain.value = 0;

  const vHigh = offlineCtx.createBiquadFilter();
  vHigh.type = 'peaking';
  vHigh.frequency.value = 3000;
  vHigh.Q.value = 0.8;
  vHigh.gain.value = 0;

  const vAir = offlineCtx.createBiquadFilter();
  vAir.type = 'highshelf';
  vAir.frequency.value = 8000;
  vAir.gain.value = 0;

  if (vocalMode === 'female-to-male') {
    vLow.frequency.value = 140;
    vLow.Q.value = 1.0;
    vLow.gain.value = 10.0;

    vHigh.frequency.value = 3000;
    vHigh.Q.value = 0.8;
    vHigh.gain.value = -10.0;

    vAir.frequency.value = 8000;
    vAir.gain.value = -6.0;
  } else if (vocalMode === 'male-to-female') {
    vLow.frequency.value = 180;
    vLow.Q.value = 1.5;
    vLow.gain.value = -11.0;

    vHigh.frequency.value = 3200;
    vHigh.Q.value = 1.2;
    vHigh.gain.value = 9.0;

    vAir.frequency.value = 8000;
    vAir.gain.value = 6.0;
  }

  // Connect Main Source Graph through vocal filters and offline Vintage Microphone convolver
  const micConvolver = offlineCtx.createConvolver();
  micConvolver.buffer = createMicImpulseResponse(offlineCtx, preset.micProfile);

  const micDryGain = offlineCtx.createGain();
  const micWetGain = offlineCtx.createGain();

  const micWet = preset.micAmount / 100;
  const micDry = 1.0 - micWet;
  micWetGain.gain.value = micWet;
  micDryGain.gain.value = micDry;

  source.connect(inputGainNode);
  inputGainNode.connect(vLow);
  vLow.connect(vHigh);
  vHigh.connect(vAir);

  // Combined shift: gender transform plus preservation of the singer's
  // original pitch against the preset's semitone drop (mirrors live preview).
  const genderShift = vocalMode === 'off' ? 0 : vocalPitchShift;
  const totalVocalShift = genderShift + (preserveVocalPitch ? -preset.semitones : 0);

  let vocalOutputNode: AudioNode = vAir;
  if (totalVocalShift !== 0) {
    const pitchShifter = new TimeDomainPitchShifter(offlineCtx);
    pitchShifter.setPitch(totalVocalShift);
    vAir.connect(pitchShifter.input);
    vocalOutputNode = pitchShifter.output;
  }

  vocalOutputNode.connect(micDryGain);
  micDryGain.connect(saturationNode);

  vocalOutputNode.connect(micConvolver);
  micConvolver.connect(micWetGain);
  micWetGain.connect(saturationNode);

  saturationNode.connect(bitcrushNode);
  bitcrushNode.connect(splitter);

  splitter.connect(wL1, 0);
  splitter.connect(wL2, 0);
  splitter.connect(wR1, 1);
  splitter.connect(wR2, 1);

  wL1.connect(merger, 0, 0);
  wR2.connect(merger, 0, 0);
  wR1.connect(merger, 0, 1);
  wL2.connect(merger, 0, 1);

  // Create offline EQ filters for separation and clarity
  const eqLowShelf = offlineCtx.createBiquadFilter();
  eqLowShelf.type = 'lowshelf';
  eqLowShelf.frequency.value = 80;
  eqLowShelf.gain.value = (preset.soulfulClarity / 100) * 3.5;

  const eqMidCut = offlineCtx.createBiquadFilter();
  eqMidCut.type = 'peaking';
  eqMidCut.frequency.value = 350;
  eqMidCut.Q.value = 0.5;
  eqMidCut.gain.value = -(preset.soulfulClarity / 100) * 4.5;

  const eqHighShelf = offlineCtx.createBiquadFilter();
  eqHighShelf.type = 'highshelf';
  eqHighShelf.frequency.value = 6000;
  eqHighShelf.gain.value = (preset.soulfulClarity / 100) * 3.0;

  merger.connect(filterNode);
  
  // Create offline EQ filters for Bass Boost and Jazz Color
  const eqBassBoost = offlineCtx.createBiquadFilter();
  eqBassBoost.type = 'lowshelf';
  eqBassBoost.frequency.value = 65;
  eqBassBoost.gain.value = ((preset.bassBoost ?? 0) / 100) * 9.0;

  const eqJazzColorPeaking = offlineCtx.createBiquadFilter();
  eqJazzColorPeaking.type = 'peaking';
  eqJazzColorPeaking.frequency.value = 1500;
  eqJazzColorPeaking.Q.value = 0.55;
  eqJazzColorPeaking.gain.value = ((preset.jazzColor ?? 0) / 100) * 4.5;

  const eqJazzColorHighShelf = offlineCtx.createBiquadFilter();
  eqJazzColorHighShelf.type = 'highshelf';
  eqJazzColorHighShelf.frequency.value = 4500;
  eqJazzColorHighShelf.gain.value = -((preset.jazzColor ?? 0) / 100) * 5.0;

  // Connect Filter EQ output into Bass/Jazz/Clarity EQ chain
  filterNode.connect(eqBassBoost);
  eqBassBoost.connect(eqJazzColorPeaking);
  eqJazzColorPeaking.connect(eqJazzColorHighShelf);
  eqJazzColorHighShelf.connect(eqLowShelf);
  eqLowShelf.connect(eqMidCut);
  eqMidCut.connect(eqHighShelf);

  // Split EQ output into dry path, delay path, and parallel reverb send path
  eqHighShelf.connect(mainGain);
  eqHighShelf.connect(delayNode);
  delayGainNode.connect(mainGain);

  // Highpass parallel Reverb send to keep low drums/bass punchy and clear
  if (preset.reverbLevel > 0) {
    const reverbSendFilter = offlineCtx.createBiquadFilter();
    reverbSendFilter.type = 'highpass';
    reverbSendFilter.frequency.value = 180; // filter low rumbles out of reverb send

    const reverbNode = offlineCtx.createConvolver();
    const duration = 0.5 + (preset.reverbSize / 100) * 3.0;
    const decay = 2.0 + (preset.reverbSize / 100) * 1.5;
    reverbNode.buffer = createReverbImpulseResponse(offlineCtx, duration, decay);

    const reverbGain = offlineCtx.createGain();
    reverbGain.gain.value = (preset.reverbLevel / 100) * 0.45;

    eqHighShelf.connect(reverbSendFilter);
    reverbSendFilter.connect(reverbNode);
    reverbNode.connect(reverbGain);
    reverbGain.connect(mainGain);
  }

  // Brick-wall limiter to prevent digital clipping in exported files
  const limiterNode = offlineCtx.createDynamicsCompressor();
  limiterNode.threshold.value = -1.0; // dB, extra headroom now input is normalized
  limiterNode.knee.value = 6.0; // soft knee avoids audible pumping on transients
  limiterNode.ratio.value = 20.0;
  limiterNode.attack.value = 0.005;
  limiterNode.release.value = 0.12;

  const makeupGain = offlineCtx.createGain();
  makeupGain.gain.value = OUTPUT_MAKEUP_GAIN;
  mainGain.connect(makeupGain);
  makeupGain.connect(limiterNode);
  limiterNode.connect(offlineCtx.destination);

  // Start all generators
  wowOsc.start();
  flutterOsc.start();
  crackleSource.start();
  hissSource.start();
  source.start();

  // Progress monitoring
  if (onProgress) {
    let progress = 0;
    const interval = setInterval(() => {
      progress += 0.1;
      onProgress(Math.min(progress, 0.95));
    }, 200);
    
    try {
      const renderedBuffer = await offlineCtx.startRendering();
      clearInterval(interval);
      onProgress(1.0);
      return bufferToWav(renderedBuffer);
    } catch (e) {
      clearInterval(interval);
      throw e;
    }
  } else {
    const renderedBuffer = await offlineCtx.startRendering();
    return bufferToWav(renderedBuffer);
  }
}

// ==========================================
// BPM Analysis & Tempo Matching Utilities
// ==========================================

export function analyzeBPM(buffer: AudioBuffer): number {
  try {
    const sampleRate = buffer.sampleRate;
    const data = buffer.getChannelData(0);
    const blockSamples = 1024;
    const stepSamples = 512;
    const energies: number[] = [];
    const times: number[] = [];

    // Limit to first 60 seconds of the track for performance
    const maxSamples = Math.min(data.length, sampleRate * 60);

    for (let i = 0; i < maxSamples - blockSamples; i += stepSamples) {
      let sum = 0;
      for (let j = 0; j < blockSamples; j++) {
        const val = data[i + j];
        sum += val * val;
      }
      energies.push(Math.sqrt(sum / blockSamples));
      times.push((i + blockSamples / 2) / sampleRate);
    }

    const fluxes: number[] = [];
    for (let i = 1; i < energies.length; i++) {
      fluxes.push(Math.max(0, energies[i] - energies[i - 1]));
    }

    const peaks: number[] = [];
    const windowSize = 15;
    for (let i = windowSize; i < fluxes.length - windowSize; i++) {
      const val = fluxes[i];
      let isLocalMax = true;
      for (let w = -5; w <= 5; w++) {
        if (fluxes[i + w] > val) {
          isLocalMax = false;
          break;
        }
      }

      if (isLocalMax) {
        let sum = 0;
        for (let w = -windowSize; w <= windowSize; w++) {
          sum += fluxes[i + w];
        }
        const localMean = sum / (windowSize * 2 + 1);
        if (val > localMean * 1.5 + 0.005) {
          peaks.push(times[i]);
        }
      }
    }

    const intervals: number[] = [];
    for (let i = 0; i < peaks.length; i++) {
      for (let j = i + 1; j < Math.min(i + 5, peaks.length); j++) {
        const delta = peaks[j] - peaks[i];
        if (delta > 0.25 && delta < 2.0) {
          intervals.push(delta);
        }
      }
    }

    if (intervals.length === 0) return 80;

    const bpmCounts: { [key: number]: number } = {};
    for (let b = 50; b <= 180; b++) {
      bpmCounts[b] = 0;
    }

    intervals.forEach(interval => {
      const rawBpm = 60 / interval;
      for (let b = 50; b <= 180; b++) {
        if (Math.abs(rawBpm - b) < 1.5) {
          bpmCounts[b] += 1.0;
        } else if (Math.abs(rawBpm * 2 - b) < 1.5) {
          bpmCounts[b] += 0.8;
        } else if (Math.abs(rawBpm / 2 - b) < 1.5) {
          bpmCounts[b] += 0.8;
        } else if (Math.abs(rawBpm * 1.5 - b) < 1.5) {
          bpmCounts[b] += 0.5;
        }
      }
    });

    let bestBpm = 80;
    let maxScore = 0;
    for (let b = 50; b <= 180; b++) {
      if (bpmCounts[b] > maxScore) {
        maxScore = bpmCounts[b];
        bestBpm = b;
      }
    }

    return bestBpm;
  } catch (err) {
    console.error('Error in analyzeBPM:', err);
    return 80; // default lofi tempo
  }
}

export function getTempoMatchRatio(analyzedBpm: number): { targetBpm: number; ratio: number } {
  if (!analyzedBpm || analyzedBpm <= 0) return { targetBpm: 80, ratio: 1.0 };

  // Sync to common lofi hip hop tempos between 70 and 90 BPM
  let baseBpm = analyzedBpm;
  if (baseBpm > 140) baseBpm /= 2;
  else if (baseBpm < 55) baseBpm *= 2;

  const standardBpms = [70, 72, 74, 75, 76, 78, 80, 82, 84, 85, 86, 88, 90];
  let closestBpm = 80;
  let minDiff = Infinity;

  standardBpms.forEach(bpm => {
    const diff = Math.abs(baseBpm - bpm);
    if (diff < minDiff) {
      minDiff = diff;
      closestBpm = bpm;
    }
  });

  let ratio = closestBpm / baseBpm;
  // Confound adjustment to +/- 15% to maintain sound quality
  if (ratio < 0.85) ratio = 0.85;
  if (ratio > 1.15) ratio = 1.15;

  return { targetBpm: closestBpm, ratio };
}

// ==========================================
// Pitch Detection & scale alignment (A4=440Hz)
// ==========================================

export function detectRootFrequency(buffer: AudioBuffer): number {
  try {
    const data = buffer.getChannelData(0);
    const sampleRate = buffer.sampleRate;

    // Use representative stable chunk of the audio from 5s to 15s
    const startSample = Math.floor(Math.max(0, Math.min(data.length - sampleRate * 10, sampleRate * 5)));
    const length = Math.min(data.length - startSample, sampleRate * 10);
    
    if (length < 2048) return 130.81; // default to C3

    const chunk = data.slice(startSample, startSample + length);
    const windowSize = 2048;
    const hopSize = 1024;
    const detectedPitches: number[] = [];

    for (let offset = 0; offset < chunk.length - windowSize; offset += hopSize) {
      const window = chunk.slice(offset, offset + windowSize);

      // Autocorrelation formula
      const r = new Float32Array(windowSize);
      for (let lag = 0; lag < windowSize; lag++) {
        let sum = 0;
        for (let i = 0; i < windowSize - lag; i++) {
          sum += window[i] * window[i + lag];
        }
        r[lag] = sum;
      }

      // First zero crossing
      let zeroCrossing = 0;
      for (let i = 0; i < windowSize - 1; i++) {
        if (r[i] > 0 && r[i + 1] <= 0) {
          zeroCrossing = i;
          break;
        }
      }

      if (zeroCrossing === 0) continue;

      // Locate peak after zero crossing
      let peakIndex = -1;
      let peakValue = -Infinity;
      for (let i = zeroCrossing; i < windowSize - 1; i++) {
        if (r[i] > r[i - 1] && r[i] > r[i + 1]) {
          if (r[i] > peakValue) {
            peakValue = r[i];
            peakIndex = i;
          }
        }
      }

      if (peakIndex !== -1) {
        const freq = sampleRate / peakIndex;
        // Restrict to common music fundamental root range (55Hz to 440Hz)
        if (freq >= 55 && freq <= 440) {
          detectedPitches.push(freq);
        }
      }
    }

    if (detectedPitches.length === 0) return 130.81; // C3

    // Average median to ignore outliers
    detectedPitches.sort((a, b) => a - b);
    return detectedPitches[Math.floor(detectedPitches.length / 2)];
  } catch (err) {
    console.error('Error in detectRootFrequency:', err);
    return 130.81; // C3
  }
}

export function calculatePitchCorrectionCents(freq: number): number {
  if (!freq || freq <= 0) return 0;
  // Fractional MIDI note formula
  const n = 12 * Math.log2(freq / 440) + 69;
  const nNearest = Math.round(n);
  const deviation = n - nNearest; // deviation from equal-temperament scale
  return -deviation * 100; // negative deviation to correct it back to center
}

export function getNoteName(freq: number): string {
  if (!freq || freq <= 0) return 'Unknown';
  const notes = ['A', 'A#', 'B', 'C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#'];
  const n = Math.round(12 * Math.log2(freq / 440) + 69);
  const octave = Math.floor(n / 12) - 1;
  const noteIndex = (n % 12 + 12) % 12;
  return `${notes[noteIndex]}${octave}`;
}
