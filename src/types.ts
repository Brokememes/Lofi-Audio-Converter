export interface LofiPreset {
  id: string;
  name: string;
  description: string;
  filterType: 'lowpass' | 'bandpass' | 'highpass';
  filterCutoff: number; // Hz
  filterQ: number;
  saturationDrive: number; // 0 to 100
  wowDepth: number; // 0 to 100 (pitch wobble)
  wowFreq: number; // Hz
  flutterDepth: number; // 0 to 100 (micro wobble)
  flutterFreq: number; // Hz
  crackleLevel: number; // 0 to 100
  hissLevel: number; // 0 to 100
  delayFeedback: number; // 0 to 100
  delayTime: number; // seconds
  stereoWidth: number; // 0 to 100 (0 = mono, 100 = full stereo)
  bitDepth: number; // 16, 12, 8, 4 (simulated)
  semitones: number; // -6 to +2 semitones
  reverbLevel: number; // 0 to 100
  reverbSize: number; // 0 to 100
  soulfulClarity: number; // 0 to 100
  micProfile: 'none' | 'ribbon' | 'tube' | 'carbon' | 'dynamic';
  micAmount: number; // 0 to 100
  bassBoost: number; // 0 to 100 (deep sub-bass lift)
  jazzColor: number; // 0 to 100 (mid-range warm presence & high-end roll-off)
}

export interface PlayerState {
  isPlaying: boolean;
  isLoaded: boolean;
  progress: number; // 0 to 1
  duration: number; // seconds
  currentTime: number; // seconds
  fileName: string;
  isProcessing: boolean;
  isExporting: boolean;
  exportProgress: number; // 0 to 1
}

export interface CustomKnobs {
  filterCutoff: number;
  filterQ: number;
  saturationDrive: number;
  wowDepth: number;
  crackleLevel: number;
  hissLevel: number;
  delayFeedback: number;
  stereoWidth: number;
  reverbLevel: number;
  reverbSize: number;
  soulfulClarity: number;
  micAmount: number;
  bassBoost: number;
  jazzColor: number;
}
