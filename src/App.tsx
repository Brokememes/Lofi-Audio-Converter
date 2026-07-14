/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { 
  Upload, 
  Play, 
  Pause, 
  Square, 
  RotateCcw, 
  Download, 
  Sparkles, 
  Sliders, 
  Music, 
  Disc, 
  Volume2, 
  Radio, 
  Layers, 
  HelpCircle,
  FileAudio,
  CheckCircle,
  Info,
  Activity,
  Users,
  Mic,
  Search,
  Video
} from 'lucide-react';
import { LofiPreset, PlayerState } from './types';
import { 
  LofiAudioManager, 
  renderLofiAudio, 
  analyzeBPM, 
  getTempoMatchRatio, 
  detectRootFrequency, 
  calculatePitchCorrectionCents, 
  getNoteName 
} from './audioEngine';
import { toolIdFromPath, pathFromToolId, applyDocumentMeta, navigateToTool, SEO_PAGES, ToolId } from './seo/router';
import { TapeReel } from './components/TapeReel';
import { VUMeter } from './components/VUMeter';
import VocalRemover from './components/VocalRemover';
import PitcherTool from './components/PitcherTool';
import KeyBpmFinder from './components/KeyBpmFinder';
import AudioCutter from './components/AudioCutter';
import AudioJoiner from './components/AudioJoiner';
import VoiceRecorder from './components/VoiceRecorder';
import SlowedReverb from './components/SlowedReverb';
import Spatial8D from './components/Spatial8D';
import AudioToVideo from './components/AudioToVideo';

// Default presets definition
const PRESETS: LofiPreset[] = [
  {
    id: 'soft-study',
    name: 'Soft Study Lofi',
    description: 'Muted high-end, smooth tape saturation, gentle pitch wobble, and light background tape hiss. Perfect for focus.',
    filterType: 'lowpass',
    filterCutoff: 3800,
    filterQ: 1.0,
    saturationDrive: 22,
    wowDepth: 16,
    wowFreq: 1.5,
    flutterDepth: 15,
    flutterFreq: 12,
    crackleLevel: 6,
    hissLevel: 6,
    delayFeedback: 22,
    delayTime: 0.35,
    stereoWidth: 75,
    bitDepth: 16,
    semitones: -1,
    reverbLevel: 40,
    reverbSize: 65,
    soulfulClarity: 65,
    micProfile: 'tube',
    micAmount: 45,
    bassBoost: 65,
    jazzColor: 60
  },
  {
    id: 'vintage-bollywood',
    name: 'Vintage Vinyl Bollywood',
    description: 'Warm, mid-focused frequency response, heavy vinyl cracks and scratches, deep wow and flutter, and narrowed stereo field mimicking early analog records.',
    filterType: 'bandpass',
    filterCutoff: 1400,
    filterQ: 0.75,
    saturationDrive: 42,
    wowDepth: 45,
    wowFreq: 2.5,
    flutterDepth: 35,
    flutterFreq: 18,
    crackleLevel: 30,
    hissLevel: 12,
    delayFeedback: 30,
    delayTime: 0.38,
    stereoWidth: 20,
    bitDepth: 12,
    semitones: -2,
    reverbLevel: 15,
    reverbSize: 40,
    soulfulClarity: 30,
    micProfile: 'ribbon',
    micAmount: 55,
    bassBoost: 45,
    jazzColor: 40
  },
  {
    id: 'bedroom-cassette',
    name: '90s Bedroom Tape',
    description: 'Warm saturation, moderate low-pass filtering, high tape hiss, and subtle wow and flutter that replicates home-recorded cassettes.',
    filterType: 'lowpass',
    filterCutoff: 3000,
    filterQ: 0.9,
    saturationDrive: 28,
    wowDepth: 15,
    wowFreq: 1.2,
    flutterDepth: 40,
    flutterFreq: 15,
    crackleLevel: 8,
    hissLevel: 22,
    delayFeedback: 25,
    delayTime: 0.45,
    stereoWidth: 85,
    bitDepth: 16,
    semitones: -1.5,
    reverbLevel: 45,
    reverbSize: 70,
    soulfulClarity: 60,
    micProfile: 'dynamic',
    micAmount: 40,
    bassBoost: 55,
    jazzColor: 50
  },
  {
    id: 'transistor-radio',
    name: '70s Transistor Radio',
    description: 'Highly restricted frequency response, aggressive warm harmonic drive, full mono width, and distinct tape-flutter. Distinct retro-nostalgia feel.',
    filterType: 'bandpass',
    filterCutoff: 1100,
    filterQ: 2.2,
    saturationDrive: 60,
    wowDepth: 55,
    wowFreq: 3.2,
    flutterDepth: 50,
    flutterFreq: 22,
    crackleLevel: 28,
    hissLevel: 18,
    delayFeedback: 15,
    delayTime: 0.22,
    stereoWidth: 0,
    bitDepth: 8,
    semitones: -3,
    reverbLevel: 10,
    reverbSize: 30,
    soulfulClarity: 20,
    micProfile: 'carbon',
    micAmount: 85,
    bassBoost: 15,
    jazzColor: 35
  }
];

export default function App() {
  const [activePreset, setActivePreset] = useState<LofiPreset>(PRESETS[0]);
  const [currentKnobs, setCurrentKnobs] = useState<LofiPreset>({ ...PRESETS[0] });
  const [playerState, setPlayerState] = useState<PlayerState>({
    isPlaying: false,
    isLoaded: false,
    progress: 0,
    duration: 0,
    currentTime: 0,
    fileName: '',
    isProcessing: false,
    isExporting: false,
    exportProgress: 0
  });

  const [activeTab, setActiveTab] = useState<'presets' | 'knobs'>('presets');
  const [currentTool, setCurrentTool] = useState<ToolId>(() => toolIdFromPath(window.location.pathname));

  // URL-driven tool selection: keeps each tool on its own path for SEO and shareable links
  const selectTool = (toolId: ToolId) => {
    navigateToTool(toolId);
    setCurrentTool(toolId);
  };

  useEffect(() => {
    applyDocumentMeta(toolIdFromPath(window.location.pathname));
    const handlePopState = () => {
      const toolId = toolIdFromPath(window.location.pathname);
      applyDocumentMeta(toolId);
      setCurrentTool(toolId);
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);
  const [presetSearchQuery, setPresetSearchQuery] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [showHowItWorks, setShowHowItWorks] = useState(false);

  // Sync, Tuning and Detection States
  const [analyzedBpm, setAnalyzedBpm] = useState<number | null>(null);
  const [detectedRootFreq, setDetectedRootFreq] = useState<number | null>(null);
  const [pitchCorrectionCents, setPitchCorrectionCents] = useState<number>(0);
  const [tempoMatchEnabled, setTempoMatchEnabled] = useState<boolean>(false);
  const [pitchCorrectionEnabled, setPitchCorrectionEnabled] = useState<boolean>(false);

  // Vocal Gender & Formant Shifter States
  const [vocalMode, setVocalMode] = useState<'off' | 'female-to-male' | 'male-to-female'>('off');
  const [vocalPitchShift, setVocalPitchShift] = useState<number>(0);
  const [isBypassed, setIsBypassed] = useState<boolean>(false);
  // Counteracts the preset's pitch drop so the singer keeps their real voice
  // (female vocals stay female) while the lofi tempo slowdown is preserved.
  const [preserveVocalPitch, setPreserveVocalPitch] = useState<boolean>(true);

  const handleBypassChange = (bypassed: boolean) => {
    setIsBypassed(bypassed);
    if (audioManagerRef.current) {
      audioManagerRef.current.setBypassed(bypassed);
    }
  };

  // Audio Manager Instantiation (Persistent Reference)
  const audioManagerRef = useRef<LofiAudioManager | null>(null);

  useEffect(() => {
    // Lazy instantiate our central manager
    audioManagerRef.current = new LofiAudioManager();
    
    // Set progress updates handler
    audioManagerRef.current.setProgressCallback((currentTime) => {
      const duration = audioManagerRef.current?.getBuffer()?.duration || 0;
      setPlayerState(prev => ({
        ...prev,
        currentTime,
        progress: duration > 0 ? currentTime / duration : 0
      }));
    });

    return () => {
      audioManagerRef.current?.stop();
    };
  }, []);

  // Update central manager when sync/tuning toggles change
  useEffect(() => {
    if (audioManagerRef.current?.isInitialized()) {
      const ratio = analyzedBpm ? getTempoMatchRatio(analyzedBpm).ratio : 1.0;
      audioManagerRef.current.setTempoMatch(tempoMatchEnabled, ratio);
    }
  }, [tempoMatchEnabled, analyzedBpm]);

  useEffect(() => {
    if (audioManagerRef.current?.isInitialized()) {
      audioManagerRef.current.setPitchCorrection(pitchCorrectionEnabled, pitchCorrectionCents);
    }
  }, [pitchCorrectionEnabled, pitchCorrectionCents]);

  useEffect(() => {
    if (audioManagerRef.current?.isInitialized()) {
      audioManagerRef.current.setVocalShifter(vocalMode, vocalPitchShift);
    }
  }, [vocalMode, vocalPitchShift]);

  useEffect(() => {
    audioManagerRef.current?.setPreserveVocalPitch(preserveVocalPitch);
  }, [preserveVocalPitch]);

  const handleVocalModeChange = (mode: 'off' | 'female-to-male' | 'male-to-female') => {
    setVocalMode(mode);
    if (mode === 'female-to-male') {
      setVocalPitchShift(-5);
    } else if (mode === 'male-to-female') {
      setVocalPitchShift(5);
    } else {
      setVocalPitchShift(0);
    }
  };

  // Update knob params in manager in real-time
  const updateKnobValue = (key: keyof LofiPreset, value: any) => {
    // Create new knobs set
    const updated = { ...currentKnobs, [key]: value };
    setCurrentKnobs(updated);

    // If it differs from the active preset, set preset to 'custom'
    if (activePreset.id !== 'custom') {
      const matchesPreset = PRESETS.find(p => {
        // Compare values
        return p.filterCutoff === (key === 'filterCutoff' ? value : currentKnobs.filterCutoff) &&
               p.saturationDrive === (key === 'saturationDrive' ? value : currentKnobs.saturationDrive) &&
               p.wowDepth === (key === 'wowDepth' ? value : currentKnobs.wowDepth) &&
               p.crackleLevel === (key === 'crackleLevel' ? value : currentKnobs.crackleLevel) &&
               p.hissLevel === (key === 'hissLevel' ? value : currentKnobs.hissLevel) &&
               p.stereoWidth === (key === 'stereoWidth' ? value : currentKnobs.stereoWidth) &&
               p.delayFeedback === (key === 'delayFeedback' ? value : currentKnobs.delayFeedback) &&
               p.reverbLevel === (key === 'reverbLevel' ? value : currentKnobs.reverbLevel) &&
               p.reverbSize === (key === 'reverbSize' ? value : currentKnobs.reverbSize) &&
               p.soulfulClarity === (key === 'soulfulClarity' ? value : currentKnobs.soulfulClarity) &&
               p.micProfile === (key === 'micProfile' ? value : currentKnobs.micProfile) &&
               p.micAmount === (key === 'micAmount' ? value : currentKnobs.micAmount) &&
               p.bassBoost === (key === 'bassBoost' ? value : currentKnobs.bassBoost) &&
               p.jazzColor === (key === 'jazzColor' ? value : currentKnobs.jazzColor) &&
               p.semitones === (key === 'semitones' ? value : currentKnobs.semitones);
      });
      if (!matchesPreset) {
        setActivePreset({
          ...updated,
          id: 'custom',
          name: 'Custom Session Preset',
          description: 'A manually tailored vintage signal chain. Modify sliders to fine-tune your lofi flavors.'
        });
      }
    }

    // Direct DSP Node update
    audioManagerRef.current?.updateParam(key, value);
  };

  const selectPreset = (preset: LofiPreset) => {
    setActivePreset(preset);
    setCurrentKnobs({ ...preset });
    
    // Push all values to active nodes
    if (audioManagerRef.current?.isInitialized()) {
      audioManagerRef.current.updateParam('filterCutoff', preset.filterCutoff);
      audioManagerRef.current.updateParam('filterQ', preset.filterQ);
      audioManagerRef.current.updateParam('saturationDrive', preset.saturationDrive);
      audioManagerRef.current.updateParam('wowDepth', preset.wowDepth);
      audioManagerRef.current.updateParam('crackleLevel', preset.crackleLevel);
      audioManagerRef.current.updateParam('hissLevel', preset.hissLevel);
      audioManagerRef.current.updateParam('delayFeedback', preset.delayFeedback);
      audioManagerRef.current.updateParam('stereoWidth', preset.stereoWidth);
      audioManagerRef.current.updateParam('reverbLevel', preset.reverbLevel);
      audioManagerRef.current.updateParam('reverbSize', preset.reverbSize);
      audioManagerRef.current.updateParam('soulfulClarity', preset.soulfulClarity);
      audioManagerRef.current.updateParam('micProfile', preset.micProfile);
      audioManagerRef.current.updateParam('micAmount', preset.micAmount);
      audioManagerRef.current.updateParam('bassBoost', preset.bassBoost);
      audioManagerRef.current.updateParam('jazzColor', preset.jazzColor);
      audioManagerRef.current.updateParam('semitones', preset.semitones);
    }
  };

  // File loading/processing
  const processAudioFile = async (file: File) => {
    if (!audioManagerRef.current) return;
    setErrorMsg('');
    setPlayerState(prev => ({ ...prev, isProcessing: true }));

    try {
      audioManagerRef.current.stop();
      
      const fileReader = new FileReader();
      
      const fileLoadedPromise = new Promise<ArrayBuffer>((resolve, reject) => {
        fileReader.onload = () => resolve(fileReader.result as ArrayBuffer);
        fileReader.onerror = () => reject(new Error('File reading error.'));
      });

      fileReader.readAsArrayBuffer(file);
      const arrayBuffer = await fileLoadedPromise;

      // Ensure AudioContext is ready before decoding
      audioManagerRef.current.init();
      
      // Decode the audio binary PCM data
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const decodedBuffer = await audioCtx.decodeAudioData(arrayBuffer);
      audioCtx.close();

      // Run BPM and Root Frequency DSP analysis algorithms
      const bpm = analyzeBPM(decodedBuffer);
      const rootFreq = detectRootFrequency(decodedBuffer);
      const cents = calculatePitchCorrectionCents(rootFreq);

      setAnalyzedBpm(bpm);
      setDetectedRootFreq(rootFreq);
      setPitchCorrectionCents(cents);
      setTempoMatchEnabled(false);
      setPitchCorrectionEnabled(false);
      setVocalMode('off');
      setVocalPitchShift(0);

      if (audioManagerRef.current) {
        audioManagerRef.current.setBuffer(decodedBuffer);
        audioManagerRef.current.setTempoMatch(false, 1.0);
        audioManagerRef.current.setPitchCorrection(false, 0);
        audioManagerRef.current.setVocalShifter('off', 0);
      }

      setPlayerState(prev => ({
        ...prev,
        isLoaded: true,
        isProcessing: false,
        isPlaying: false,
        fileName: file.name,
        progress: 0,
        currentTime: 0,
        duration: decodedBuffer.duration
      }));

    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.message || 'Error decoding audio file. Make sure it is a valid MP3, WAV, or FLAC.');
      setPlayerState(prev => ({ ...prev, isProcessing: false }));
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      processAudioFile(e.target.files[0]);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  };

  const handleDragLeave = () => {
    setDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      processAudioFile(e.dataTransfer.files[0]);
    }
  };

  // Playback Controls
  const togglePlay = () => {
    if (!audioManagerRef.current || !playerState.isLoaded) return;

    if (playerState.isPlaying) {
      audioManagerRef.current.pause();
      setPlayerState(prev => ({ ...prev, isPlaying: false }));
    } else {
      audioManagerRef.current.start(currentKnobs);
      setPlayerState(prev => ({ ...prev, isPlaying: true }));
    }
  };

  const stopPlayback = () => {
    if (!audioManagerRef.current) return;
    audioManagerRef.current.stop();
    setPlayerState(prev => ({
      ...prev,
      isPlaying: false,
      progress: 0,
      currentTime: 0
    }));
  };

  const seekAudio = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!audioManagerRef.current || !playerState.isLoaded) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const ratio = clickX / rect.width;
    const seekTime = ratio * playerState.duration;

    setPlayerState(prev => ({
      ...prev,
      progress: ratio,
      currentTime: seekTime
    }));

    if (playerState.isPlaying) {
      audioManagerRef.current.start(currentKnobs, seekTime);
    } else {
      // Just update pause offset
      audioManagerRef.current.start(currentKnobs, seekTime);
      audioManagerRef.current.pause();
    }
  };

  // Exporting process
  const triggerExport = async () => {
    const buffer = audioManagerRef.current?.getBuffer();
    if (!buffer) return;

    setPlayerState(prev => ({ ...prev, isExporting: true, exportProgress: 0 }));

    try {
      // Pause active listening preview to focus processing
      if (playerState.isPlaying) {
        togglePlay();
      }

      const ratio = analyzedBpm ? getTempoMatchRatio(analyzedBpm).ratio : 1.0;
      const exportedBlob = await renderLofiAudio(
        buffer, 
        currentKnobs, 
        (progress) => {
          setPlayerState(prev => ({ ...prev, exportProgress: progress }));
        },
        tempoMatchEnabled,
        ratio,
        pitchCorrectionEnabled,
        pitchCorrectionCents,
        vocalMode,
        vocalPitchShift,
        preserveVocalPitch
      );

      // Prompt automatic file download
      const downloadUrl = URL.createObjectURL(exportedBlob);
      const downloadLink = document.createElement('a');
      const cleanName = playerState.fileName.substring(0, playerState.fileName.lastIndexOf('.')) || playerState.fileName;
      downloadLink.href = downloadUrl;
      downloadLink.download = `${cleanName}_lofi_${activePreset.id}.wav`;
      document.body.appendChild(downloadLink);
      downloadLink.click();
      document.body.removeChild(downloadLink);
      URL.revokeObjectURL(downloadUrl);

      // Finish state
      setPlayerState(prev => ({ ...prev, isExporting: false, exportProgress: 1.0 }));

    } catch (err: any) {
      console.error(err);
      setErrorMsg('Export rendering failed. Please try again.');
      setPlayerState(prev => ({ ...prev, isExporting: false }));
    }
  };

  // Helper formatting seconds
  const formatTime = (secs: number) => {
    const mins = Math.floor(secs / 60);
    const remainingSecs = Math.floor(secs % 60);
    return `${mins}:${remainingSecs < 10 ? '0' : ''}${remainingSecs}`;
  };

  return (
    <div className="min-h-screen bg-[#141210] text-[#eae5db] font-sans antialiased flex flex-col justify-between selection:bg-amber-800 selection:text-amber-100">
      
      {/* HEADER BAR */}
      <header className="border-b border-[#2d2822] bg-[#1a1714] px-6 py-4 flex justify-between items-center z-10 shadow-lg">
        <div className="flex items-center space-x-3">
          <div className="w-9 h-9 rounded-lg bg-amber-600 flex items-center justify-center border border-amber-500 shadow-md">
            <Radio className="w-5 h-5 text-[#141210] animate-pulse" />
          </div>
          <div>
            <h1 className="text-lg font-bold font-sans tracking-tight text-white flex items-center">
              LOFI AUDIO CONVERTER
              <span className="ml-2 text-[9px] font-mono tracking-widest bg-amber-900/40 text-amber-500 px-1.5 py-0.5 rounded border border-amber-800">
                DSP ENGINE
              </span>
            </h1>
            <p className="text-xs text-[#a39785] font-mono">Analog Tape & Vinyl Texture Modulator</p>
          </div>
        </div>

        <div className="flex items-center space-x-3">
          <button
            onClick={() => setShowHowItWorks(!showHowItWorks)}
            className="flex items-center space-x-1.5 px-3 py-1.5 rounded bg-[#26211d] hover:bg-[#342d27] text-xs font-mono text-[#d6cab4] border border-[#3e362e] transition"
          >
            <HelpCircle className="w-4 h-4 text-amber-500" />
            <span>How it Works</span>
          </button>
        </div>
      </header>

      {/* HOW IT WORKS BANNER */}
      {showHowItWorks && (
        <div className="bg-[#1e1a16] border-b border-[#362f27] px-8 py-5 text-sm leading-relaxed max-w-full z-10 animate-fade-in text-[#cfc4b2]">
          <div className="max-w-4xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-6 relative">
            <div>
              <h3 className="text-white font-semibold flex items-center mb-2">
                <Sparkles className="w-4 h-4 mr-2 text-amber-500" />
                Browser-Accelerated Lofi Pipeline
              </h3>
              <p className="text-xs text-[#a89d89]">
                This app runs fully in your web browser utilizing the native high-performance Web Audio API. 
                Your files are decoded, run through physical DSP models, and compiled directly in-memory.
                Your data is 100% private and processed locally with zero network latency.
              </p>
            </div>
            <div>
              <h3 className="text-white font-semibold flex items-center mb-2">
                <Sliders className="w-4 h-4 mr-2 text-amber-500" />
                Under the Hood DSP Chain
              </h3>
              <ul className="text-xs text-[#a89d89] space-y-1 list-disc pl-4">
                <li><strong className="text-amber-600 font-medium">Wow & Flutter:</strong> Dual slow/fast LFOs modulate buffer playbackRate directly.</li>
                <li><strong className="text-amber-600 font-medium">Tape Saturation:</strong> A waveshaper applying smooth hyperbolic tangent <code className="font-mono bg-[#141210] px-1 py-0.5 rounded text-amber-400">tanh(x)</code>.</li>
                <li><strong className="text-amber-600 font-medium">Procedural Noise:</strong> Matched white/pink bandpass hiss and random impulse clicks.</li>
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* ERROR MESSAGE BAR */}
      {errorMsg && (
        <div className="bg-red-950/70 border-b border-red-900 px-6 py-3 text-xs text-red-300 font-mono flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <span className="w-2 h-2 rounded-full bg-red-500 animate-ping" />
            <span><strong>Processing Block:</strong> {errorMsg}</span>
          </div>
          <button onClick={() => setErrorMsg('')} className="hover:text-white underline cursor-pointer">Dismiss</button>
        </div>
      )}

      {/* MULTI-TOOL NAVIGATION TAB BAR */}
      <div className="border-b border-[#2d2822] bg-[#1a1714] px-4 md:px-8 py-3.5 flex flex-wrap gap-2.5 justify-center items-center z-20 relative shadow-md">
        <div className="flex items-center space-x-1.5 mr-2">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
          <span className="text-[10px] font-mono font-bold tracking-widest text-amber-500 border border-amber-800/60 bg-amber-950/30 px-2 py-0.5 rounded-md">
            DSP CONSOLE
          </span>
        </div>
        <button
          onClick={() => selectTool('lofi')}
          className={`px-3.5 py-1.5 rounded-lg text-xs font-mono font-bold tracking-wider transition-all duration-150 flex items-center gap-1.5 border ${
            currentTool === 'lofi'
              ? 'bg-amber-600 text-[#141210] border-amber-500 shadow-md'
              : 'bg-[#1e1a16] text-[#a39785] border-[#2d2822] hover:text-white hover:border-[#4d443a]'
          }`}
        >
          <Radio className="w-3.5 h-3.5" />
          <span>LOFI GENERATOR</span>
        </button>
        <button
          onClick={() => selectTool('vocal_remover')}
          className={`px-3.5 py-1.5 rounded-lg text-xs font-mono font-bold tracking-wider transition-all duration-150 flex items-center gap-1.5 border ${
            currentTool === 'vocal_remover'
              ? 'bg-amber-600 text-[#141210] border-amber-500 shadow-md'
              : 'bg-[#1e1a16] text-[#a39785] border-[#2d2822] hover:text-white hover:border-[#4d443a]'
          }`}
        >
          <Sliders className="w-3.5 h-3.5" />
          <span>VOCAL REMOVER</span>
        </button>
        <button
          onClick={() => selectTool('pitcher')}
          className={`px-3.5 py-1.5 rounded-lg text-xs font-mono font-bold tracking-wider transition-all duration-150 flex items-center gap-1.5 border ${
            currentTool === 'pitcher'
              ? 'bg-amber-600 text-[#141210] border-amber-500 shadow-md'
              : 'bg-[#1e1a16] text-[#a39785] border-[#2d2822] hover:text-white hover:border-[#4d443a]'
          }`}
        >
          <Activity className="w-3.5 h-3.5" />
          <span>PITCH & TEMPO</span>
        </button>
        <button
          onClick={() => selectTool('key_bpm')}
          className={`px-3.5 py-1.5 rounded-lg text-xs font-mono font-bold tracking-wider transition-all duration-150 flex items-center gap-1.5 border ${
            currentTool === 'key_bpm'
              ? 'bg-amber-600 text-[#141210] border-amber-500 shadow-md'
              : 'bg-[#1e1a16] text-[#a39785] border-[#2d2822] hover:text-white hover:border-[#4d443a]'
          }`}
        >
          <Search className="w-3.5 h-3.5" />
          <span>KEY & BPM FINDER</span>
        </button>
        <button
          onClick={() => selectTool('cutter')}
          className={`px-3.5 py-1.5 rounded-lg text-xs font-mono font-bold tracking-wider transition-all duration-150 flex items-center gap-1.5 border ${
            currentTool === 'cutter'
              ? 'bg-amber-600 text-[#141210] border-amber-500 shadow-md'
              : 'bg-[#1e1a16] text-[#a39785] border-[#2d2822] hover:text-white hover:border-[#4d443a]'
          }`}
        >
          <Sliders className="w-3.5 h-3.5 text-rose-500" />
          <span>AUDIO CUTTER</span>
        </button>
        <button
          onClick={() => selectTool('joiner')}
          className={`px-3.5 py-1.5 rounded-lg text-xs font-mono font-bold tracking-wider transition-all duration-150 flex items-center gap-1.5 border ${
            currentTool === 'joiner'
              ? 'bg-amber-600 text-[#141210] border-amber-500 shadow-md'
              : 'bg-[#1e1a16] text-[#a39785] border-[#2d2822] hover:text-white hover:border-[#4d443a]'
          }`}
        >
          <Music className="w-3.5 h-3.5" />
          <span>AUDIO JOINER</span>
        </button>
        <button
          onClick={() => selectTool('recorder')}
          className={`px-3.5 py-1.5 rounded-lg text-xs font-mono font-bold tracking-wider transition-all duration-150 flex items-center gap-1.5 border ${
            currentTool === 'recorder'
              ? 'bg-amber-600 text-[#141210] border-amber-500 shadow-md'
              : 'bg-[#1e1a16] text-[#a39785] border-[#2d2822] hover:text-white hover:border-[#4d443a]'
          }`}
        >
          <Mic className="w-3.5 h-3.5 text-red-500 animate-pulse" />
          <span>RECORDING STUDIO</span>
        </button>
        <button
          onClick={() => selectTool('slowed_reverb')}
          className={`px-3.5 py-1.5 rounded-lg text-xs font-mono font-bold tracking-wider transition-all duration-150 flex items-center gap-1.5 border ${
            currentTool === 'slowed_reverb'
              ? 'bg-amber-600 text-[#141210] border-amber-500 shadow-md'
              : 'bg-[#1e1a16] text-[#a39785] border-[#2d2822] hover:text-white hover:border-[#4d443a]'
          }`}
        >
          <Activity className="w-3.5 h-3.5 text-amber-500 animate-pulse" />
          <span>SLOWED & REVERB</span>
        </button>
        <button
          onClick={() => selectTool('spatial_8d')}
          className={`px-3.5 py-1.5 rounded-lg text-xs font-mono font-bold tracking-wider transition-all duration-150 flex items-center gap-1.5 border ${
            currentTool === 'spatial_8d'
              ? 'bg-amber-600 text-[#141210] border-amber-500 shadow-md'
              : 'bg-[#1e1a16] text-[#a39785] border-[#2d2822] hover:text-white hover:border-[#4d443a]'
          }`}
        >
          <Disc className="w-3.5 h-3.5 text-orange-500 animate-spin" style={{ animationDuration: '4s' }} />
          <span>8D AUDIO SPATIALIZER</span>
        </button>
        <button
          onClick={() => selectTool('audio_to_video')}
          className={`px-3.5 py-1.5 rounded-lg text-xs font-mono font-bold tracking-wider transition-all duration-150 flex items-center gap-1.5 border ${
            currentTool === 'audio_to_video'
              ? 'bg-amber-600 text-[#141210] border-amber-500 shadow-md'
              : 'bg-[#1e1a16] text-[#a39785] border-[#2d2822] hover:text-white hover:border-[#4d443a]'
          }`}
        >
          <Video className="w-3.5 h-3.5 text-emerald-500" />
          <span>AUDIO-TO-VIDEO</span>
        </button>
      </div>

      {currentTool === 'lofi' ? (
        /* MAIN CONTAINER */
        <main className="flex-grow max-w-7xl w-full mx-auto p-4 md:p-6 lg:p-8 grid grid-cols-1 lg:grid-cols-12 gap-6 md:gap-8 items-start">
        
        {/* LEFT COLUMN (LOFI PLAYER & TAPE DECKS) - 5 COLS */}
        <section className="lg:col-span-5 flex flex-col space-y-6">
          
          {/* TAPEREEL VISUALIZER CARD */}
          <div className="bg-[#1a1714] rounded-2xl border border-[#2d2822] p-5 shadow-xl space-y-5">
            <div className="flex justify-between items-center border-b border-[#2d2822] pb-3">
              <span className="text-xs font-mono text-[#a39785] flex items-center">
                <Music className="w-3.5 h-3.5 mr-1.5 text-amber-500" />
                ACTIVE CASSETTE DECK
              </span>
              <span className={`w-2.5 h-2.5 rounded-full ${playerState.isPlaying ? 'bg-emerald-500 animate-pulse' : 'bg-[#3c362e]'}`} />
            </div>

            {/* CASSETTE SVG */}
            <TapeReel 
              isPlaying={playerState.isPlaying} 
              progress={playerState.progress}
              songName={playerState.isLoaded ? playerState.fileName : undefined}
            />

            {/* AUDIO PROGRESS TIMELINE */}
            <div className="space-y-1.5">
              <div className="flex justify-between text-[10px] font-mono text-[#a39785] px-1">
                <span>{formatTime(playerState.currentTime)}</span>
                <span>{playerState.isLoaded ? formatTime(playerState.duration) : '0:00'}</span>
              </div>
              <div 
                onClick={seekAudio}
                className={`h-2.5 w-full rounded-full bg-[#11100e] overflow-hidden border border-[#2d2822] ${playerState.isLoaded ? 'cursor-pointer hover:border-[#3e362e]' : 'cursor-not-allowed opacity-40'}`}
              >
                <div 
                  className="h-full bg-gradient-to-r from-amber-600 to-amber-400 rounded-full transition-all duration-100 ease-linear shadow-[0_0_8px_rgba(217,119,6,0.5)]"
                  style={{ width: `${playerState.progress * 100}%` }}
                />
              </div>
            </div>

            {/* COMPARISON MONITOR TOGGLE */}
            <div className="flex items-center justify-between p-2 bg-[#11100e] rounded-xl border border-[#2d2822] text-xs font-mono">
              <span className="text-[10px] text-[#8e816d] pl-1 font-bold uppercase tracking-wider flex items-center">
                <Sliders className="w-3.5 h-3.5 mr-1.5 text-amber-500" />
                Audio Monitor
              </span>
              <div className="flex bg-[#1d1916] rounded-lg p-1 border border-[#2d2822]/40">
                <button
                  type="button"
                  disabled={!playerState.isLoaded}
                  onClick={() => handleBypassChange(true)}
                  className={`px-3 py-1 rounded-md text-[10px] font-bold transition flex items-center space-x-1.5 ${
                    !playerState.isLoaded
                      ? 'text-[#3c362e] cursor-not-allowed'
                      : isBypassed
                        ? 'bg-[#2d2822] text-white shadow-sm border border-[#3e362e]'
                        : 'text-[#8e816d] hover:text-[#cfc4b2]'
                  }`}
                  title="Listen to original, unprocessed audio"
                >
                  <span className={`w-1.5 h-1.5 rounded-full ${isBypassed ? 'bg-amber-500 shadow-[0_0_6px_#f59e0b]' : 'bg-[#3c362e]'}`} />
                  <span>Original</span>
                </button>
                <button
                  type="button"
                  disabled={!playerState.isLoaded}
                  onClick={() => handleBypassChange(false)}
                  className={`px-3 py-1 rounded-md text-[10px] font-bold transition flex items-center space-x-1.5 ${
                    !playerState.isLoaded
                      ? 'text-[#3c362e] cursor-not-allowed'
                      : !isBypassed
                        ? 'bg-amber-600/20 text-amber-400 border border-amber-600/35 shadow-sm'
                        : 'text-[#8e816d] hover:text-[#cfc4b2]'
                  }`}
                  title="Listen to the warm, processed lofi version"
                >
                  <span className={`w-1.5 h-1.5 rounded-full ${!isBypassed ? 'bg-emerald-400 shadow-[0_0_6px_#34d399]' : 'bg-[#3c362e]'}`} />
                  <span>Processed Lofi</span>
                </button>
              </div>
            </div>

            {/* TRANSPORT SYSTEM & CONTROLS */}
            <div className="flex justify-between items-center pt-2 gap-3">
              <div className="flex items-center space-x-2">
                <button
                  onClick={togglePlay}
                  disabled={!playerState.isLoaded}
                  className={`w-12 h-12 rounded-xl flex items-center justify-center transition border ${
                    !playerState.isLoaded 
                      ? 'bg-[#11100e] text-[#3c362e] border-transparent cursor-not-allowed' 
                      : playerState.isPlaying 
                        ? 'bg-amber-600 text-[#141210] border-amber-500 shadow-md hover:bg-amber-500' 
                        : 'bg-[#26211d] text-[#eae5db] border-[#3e362e] hover:bg-[#342d27]'
                  }`}
                  title={playerState.isPlaying ? 'Pause Tape' : 'Play Tape'}
                >
                  {playerState.isPlaying ? <Pause className="w-5 h-5 fill-current" /> : <Play className="w-5 h-5 fill-current ml-0.5" />}
                </button>

                <button
                  onClick={stopPlayback}
                  disabled={!playerState.isLoaded}
                  className={`w-10 h-10 rounded-xl flex items-center justify-center border transition ${
                    !playerState.isLoaded 
                      ? 'bg-[#11100e] text-[#3c362e] border-transparent cursor-not-allowed' 
                      : 'bg-[#26211d] text-[#eae5db] border-[#3e362e] hover:bg-[#342d27]'
                  }`}
                  title="Stop Tape"
                >
                  <Square className="w-4 h-4 fill-current" />
                </button>

                <button
                  onClick={() => {
                    if (audioManagerRef.current && playerState.isLoaded) {
                      audioManagerRef.current.start(currentKnobs, 0);
                      setPlayerState(prev => ({ ...prev, isPlaying: true }));
                    }
                  }}
                  disabled={!playerState.isLoaded}
                  className={`w-10 h-10 rounded-xl flex items-center justify-center border transition ${
                    !playerState.isLoaded 
                      ? 'bg-[#11100e] text-[#3c362e] border-transparent cursor-not-allowed' 
                      : 'bg-[#26211d] text-[#eae5db] border-[#3e362e] hover:bg-[#342d27]'
                  }`}
                  title="Rewind / Restart"
                >
                  <RotateCcw className="w-4 h-4" />
                </button>
              </div>

              {/* SAVE / EXPORT LOFI BUTTON */}
              <button
                onClick={triggerExport}
                disabled={!playerState.isLoaded || playerState.isExporting}
                className={`px-4 h-11 rounded-xl font-mono text-xs font-bold tracking-wider flex items-center space-x-2 border transition ${
                  !playerState.isLoaded 
                    ? 'bg-[#11100e] text-[#3c362e] border-transparent cursor-not-allowed' 
                    : 'bg-emerald-600 text-white border-emerald-500 shadow-md hover:bg-emerald-500 animate-pulse'
                }`}
              >
                <Download className="w-4 h-4" />
                <span>EXPORT LOFI</span>
              </button>
            </div>
          </div>

          {/* AESTHETIC TUNING & TEMPO SYNC CONSOLE */}
          <div className="bg-[#1a1714] rounded-2xl border border-[#2d2822] p-5 shadow-xl space-y-4">
            <div className="flex justify-between items-center border-b border-[#2d2822] pb-3">
              <span className="text-xs font-mono text-[#a39785] flex items-center">
                <Activity className="w-3.5 h-3.5 mr-1.5 text-amber-500" />
                LOFI TUNING & SYNC CONSOLE
              </span>
              <span className="text-[9px] font-mono tracking-widest bg-[#231e1a] text-amber-500 px-1.5 py-0.5 rounded border border-[#3e362e]">
                REAL-TIME ANALYZER
              </span>
            </div>

            {!playerState.isLoaded ? (
              <div className="text-center py-6 px-4 bg-[#11100e] rounded-xl border border-[#231e1a]">
                <p className="text-xs text-[#746957] font-mono">Load an audio file to enable BPM analysis and root frequency micro-tuning.</p>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Tempo Match Module */}
                  <div className="p-3.5 bg-[#11100e] rounded-xl border border-[#2c261e] flex flex-col justify-between space-y-3">
                    <div className="space-y-1">
                      <span className="text-[10px] font-mono text-[#8e816d] block uppercase tracking-wider">TEMPO DETECTOR</span>
                      <div className="text-sm font-bold text-white flex items-baseline">
                        {analyzedBpm ? `${analyzedBpm} BPM` : 'Analyzing...'}
                        <span className="text-[9px] font-mono text-[#8e816d] ml-1.5 font-normal">Original</span>
                      </div>
                      
                      {tempoMatchEnabled && analyzedBpm && (
                        <div className="text-[10px] font-mono text-amber-500 flex items-center mt-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-amber-500 mr-1.5 animate-pulse" />
                          Matched to: {getTempoMatchRatio(analyzedBpm).targetBpm} BPM ({Math.round(getTempoMatchRatio(analyzedBpm).ratio * 100)}% Speed)
                        </div>
                      )}
                    </div>

                    <button
                      onClick={() => setTempoMatchEnabled(!tempoMatchEnabled)}
                      className={`w-full py-2 px-3 rounded-lg text-[11px] font-mono font-bold border transition duration-150 ${
                        tempoMatchEnabled
                          ? 'bg-amber-600 border-amber-500 text-black hover:bg-amber-500 shadow-sm'
                          : 'bg-[#1a1714] border-[#2a241f] text-[#cfc4b2] hover:border-[#3d342b] hover:bg-[#25201b]'
                      }`}
                    >
                      {tempoMatchEnabled ? 'TEMPO SYNC: ACTIVE' : 'SYNC TEMPO (70-90 BPM)'}
                    </button>
                  </div>

                  {/* Pitch Tuning Module */}
                  <div className="p-3.5 bg-[#11100e] rounded-xl border border-[#2c261e] flex flex-col justify-between space-y-3">
                    <div className="space-y-1">
                      <span className="text-[10px] font-mono text-[#8e816d] block uppercase tracking-wider">TONIC SCALE LOCK</span>
                      <div className="text-sm font-bold text-white flex items-baseline">
                        {detectedRootFreq ? `${getNoteName(detectedRootFreq)}` : 'Analyzing...'}
                        <span className="text-[9px] font-mono text-[#8e816d] ml-1.5 font-normal">({detectedRootFreq?.toFixed(1)} Hz)</span>
                      </div>

                      {pitchCorrectionEnabled && (
                        <div className="text-[10px] font-mono text-emerald-500 flex items-center mt-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 mr-1.5 animate-pulse" />
                          Corrected Offset: {pitchCorrectionCents > 0 ? '+' : ''}{pitchCorrectionCents.toFixed(1)} cents
                        </div>
                      )}
                    </div>

                    <button
                      onClick={() => setPitchCorrectionEnabled(!pitchCorrectionEnabled)}
                      className={`w-full py-2 px-3 rounded-lg text-[11px] font-mono font-bold border transition duration-150 ${
                        pitchCorrectionEnabled
                          ? 'bg-emerald-600 border-emerald-500 text-white hover:bg-emerald-500 shadow-sm'
                          : 'bg-[#1a1714] border-[#2a241f] text-[#cfc4b2] hover:border-[#3d342b] hover:bg-[#25201b]'
                      }`}
                    >
                      {pitchCorrectionEnabled ? 'SCALE LOCK: ACTIVE' : 'ALIGN TO A4=440HZ'}
                    </button>
                  </div>
                </div>

                <p className="text-[10px] text-[#746957] leading-normal font-sans">
                  Autocorrelation analysis locks root key scale alignment to prevent microtonal drifting during speed changes.
                </p>
              </div>
            )}
          </div>

          {/* VOCAL GENDER & CHARACTER SHIFTER CONSOLE */}
          <div className="bg-[#1a1714] rounded-2xl border border-[#2d2822] p-5 shadow-xl space-y-4">
            <div className="flex justify-between items-center border-b border-[#2d2822] pb-3">
              <span className="text-xs font-mono text-[#a39785] flex items-center">
                <Users className="w-3.5 h-3.5 mr-1.5 text-pink-500" />
                VOCAL GENDER & CHARACTER SHIFTER
              </span>
              <span className="text-[9px] font-mono tracking-widest bg-[#231e1a] text-pink-500 px-1.5 py-0.5 rounded border border-[#3e362e]">
                FORMANT & PITCH DSP
              </span>
            </div>

            {!playerState.isLoaded ? (
              <div className="text-center py-6 px-4 bg-[#11100e] rounded-xl border border-[#231e1a]">
                <p className="text-xs text-[#746957] font-mono">Load an audio file to unlock male/female vocal gender transformations.</p>
              </div>
            ) : (
              <div className="space-y-4">
                <button
                  onClick={() => setPreserveVocalPitch(!preserveVocalPitch)}
                  className={`w-full py-2.5 px-3 rounded-lg text-[11px] font-mono font-bold border transition duration-150 flex items-center justify-between ${
                    preserveVocalPitch
                      ? 'bg-emerald-600/20 border-emerald-500/40 text-emerald-400 shadow-sm'
                      : 'bg-[#11100e] border-[#1d1915] text-[#8e816d] hover:border-[#2a241f]'
                  }`}
                >
                  <span>KEEP SINGER'S ORIGINAL VOICE</span>
                  <span className={`w-2 h-2 rounded-full ${preserveVocalPitch ? 'bg-emerald-400 animate-pulse' : 'bg-[#3c362e]'}`} />
                </button>
                <p className="text-[10px] text-[#746957] leading-normal font-sans -mt-2">
                  Lofi presets slow the tape slightly, which drags vocals deeper — a female singer can start sounding male. Keep this ON to restore the singer's real pitch while the lofi slowdown stays.
                </p>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    onClick={() => handleVocalModeChange('off')}
                    className={`py-2 px-1 rounded-lg text-[10px] font-mono font-bold border transition duration-150 ${
                      vocalMode === 'off'
                        ? 'bg-[#2a241f] border-[#44382b] text-white'
                        : 'bg-[#11100e] border-[#1d1915] text-[#8e816d] hover:border-[#2a241f]'
                    }`}
                  >
                    ORIGINAL
                  </button>
                  <button
                    onClick={() => handleVocalModeChange('female-to-male')}
                    className={`py-2 px-1 rounded-lg text-[10px] font-mono font-bold border transition duration-150 ${
                      vocalMode === 'female-to-male'
                        ? 'bg-amber-600/20 border-amber-500/40 text-amber-500 shadow-sm'
                        : 'bg-[#11100e] border-[#1d1915] text-[#8e816d] hover:border-[#2a241f]'
                    }`}
                  >
                    FEMALE ➜ MALE
                  </button>
                  <button
                    onClick={() => handleVocalModeChange('male-to-female')}
                    className={`py-2 px-1 rounded-lg text-[10px] font-mono font-bold border transition duration-150 ${
                      vocalMode === 'male-to-female'
                        ? 'bg-pink-600/20 border-pink-500/40 text-pink-400 shadow-sm'
                        : 'bg-[#11100e] border-[#1d1915] text-[#8e816d] hover:border-[#2a241f]'
                    }`}
                  >
                    MALE ➜ FEMALE
                  </button>
                </div>

                <div className="p-3.5 bg-[#11100e] rounded-xl border border-[#2c261e] space-y-3">
                  <div className="flex justify-between items-center text-[10px] font-mono">
                    <span className="text-[#8e816d] uppercase tracking-wider">VOCAL PITCH TRANSPOSE</span>
                    <span className="font-bold text-white">
                      {vocalPitchShift > 0 ? `+${vocalPitchShift}` : vocalPitchShift} Semitones
                    </span>
                  </div>

                  <input
                    type="range"
                    min="-12"
                    max="12"
                    step="1"
                    value={vocalPitchShift}
                    onChange={(e) => setVocalPitchShift(parseInt(e.target.value))}
                    className="w-full accent-amber-500 h-1.5 bg-[#1d1915] rounded-lg cursor-pointer"
                  />

                  <div className="flex justify-between text-[9px] font-mono text-[#746957]">
                    <span>-12 ST (DEEPER)</span>
                    <span>0 (FLAT)</span>
                    <span>+12 ST (HIGHER)</span>
                  </div>
                </div>

                <div className="text-[10px] text-[#746957] font-sans leading-relaxed space-y-2">
                  <p>
                    {vocalMode === 'off' && "Select a transformation mode to automatically adjust vocal formant resonance and shift tape frequencies."}
                    {vocalMode === 'female-to-male' && "Active: Multi-band peaking filter boosts 140Hz chest resonance and cuts 3kHz nasality to sculpt a deeper, warm masculine vocal quality."}
                    {vocalMode === 'male-to-female' && "Active: Peaking cut at 180Hz eliminates low-mid muddy chest rumble, while boosting 3.2kHz presence and 8kHz air adds breathy female vocal brightness."}
                  </p>
                  <p className="text-amber-500/90 font-mono text-[9px] border-t border-[#231e1a] pt-2">
                    💡 recommendation: Fine-tune the pitch slider to match your specific song's key!
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* RETRO VU METER CARD & SYSTEM STATS */}
          <div className="bg-[#1a1714] rounded-2xl border border-[#2d2822] p-5 shadow-xl flex flex-col items-center justify-center space-y-4">
            <span className="text-[10px] font-mono text-[#a39785] self-start flex items-center">
              <Volume2 className="w-3.5 h-3.5 mr-1.5 text-amber-500" />
              ANALOG TRANSDUCTION METER
            </span>
            <VUMeter 
              analyserNode={audioManagerRef.current?.analyserNode || null} 
              isPlaying={playerState.isPlaying} 
            />
            <div className="w-full flex justify-between px-1 text-[9px] font-mono text-[#746957]">
              <span>SAMPLE RATE: 44.1 KHZ</span>
              <span>DYNAMIC RANGE: 16-BIT PCM</span>
            </div>
          </div>
        </section>

        {/* RIGHT COLUMN (FILE UPLOAD & MIXING CONSOLE) - 7 COLS */}
        <section className="lg:col-span-7 flex flex-col space-y-6">
          
          {/* UPLOAD / DROP DOCK */}
          {!playerState.isLoaded ? (
            <div 
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              className={`bg-[#1a1714] rounded-2xl border-2 border-dashed p-10 flex flex-col items-center justify-center text-center space-y-5 transition-all min-h-[300px] shadow-xl ${
                dragOver 
                  ? 'border-amber-500 bg-amber-950/10 scale-[0.99]' 
                  : 'border-[#2d2822] hover:border-[#3e362e] hover:bg-[#1d1a16]'
              }`}
            >
              {playerState.isProcessing ? (
                <div className="space-y-4 animate-pulse">
                  <div className="w-16 h-16 rounded-full bg-amber-900/30 border border-amber-600 flex items-center justify-center mx-auto">
                    <Radio className="w-8 h-8 text-amber-500 animate-spin" />
                  </div>
                  <div className="space-y-1">
                    <h3 className="text-sm font-bold text-white uppercase tracking-widest font-sans">DECODING AUDIO STREAM</h3>
                    <p className="text-xs text-[#a39785] font-mono">Applying DSP alignment & Procedural core buffers...</p>
                  </div>
                </div>
              ) : (
                <>
                  <div className="w-16 h-16 rounded-full bg-[#26211d] flex items-center justify-center border border-[#3e362e] shadow-inner text-[#a39785]">
                    <Upload className="w-7 h-7 text-amber-500" />
                  </div>
                  
                  <div className="space-y-2 max-w-sm">
                    <h3 className="text-base font-bold text-white tracking-tight">Upload your track for lofi processing</h3>
                    <p className="text-xs text-[#a39785] leading-normal font-sans">
                      Drag and drop your audio here, or click to browse. Supports MP3, WAV, FLAC, and AAC formats.
                    </p>
                  </div>

                  <label className="px-4 py-2 bg-amber-600 text-[#141210] rounded-xl font-bold font-mono text-xs tracking-wider cursor-pointer shadow-md hover:bg-amber-500 transition">
                    SELECT FILE
                    <input 
                      type="file" 
                      accept="audio/*" 
                      onChange={handleFileChange} 
                      className="hidden" 
                    />
                  </label>
                </>
              )}
            </div>
          ) : (
            /* ACTIVE SIGNAL BOARD / MIXING BOARD */
            <div className="bg-[#1a1714] rounded-2xl border border-[#2d2822] p-6 shadow-xl space-y-6">
              
              {/* MIXER CONTROLS HEADER / TAB TOGGLER */}
              <div className="flex justify-between items-center border-b border-[#2d2822] pb-4">
                <div className="flex items-center space-x-2">
                  <div className="w-2 h-2 rounded-full bg-amber-500" />
                  <span className="text-xs font-mono font-bold uppercase tracking-wider text-[#dcd6c9]">
                    LO-FI REEL MODULATOR BOARD
                  </span>
                </div>

                <div className="flex space-x-1.5 bg-[#11100e] p-1 rounded-lg border border-[#2a251f]">
                  <button
                    onClick={() => setActiveTab('presets')}
                    className={`px-3 py-1.5 rounded-md text-xs font-mono font-semibold transition ${
                      activeTab === 'presets'
                        ? 'bg-amber-600 text-[#141210]'
                        : 'text-[#a39785] hover:text-white'
                    }`}
                  >
                    Presets
                  </button>
                  <button
                    onClick={() => setActiveTab('knobs')}
                    className={`px-3 py-1.5 rounded-md text-xs font-mono font-semibold transition ${
                      activeTab === 'knobs'
                        ? 'bg-amber-600 text-[#141210]'
                        : 'text-[#a39785] hover:text-white'
                    }`}
                  >
                    Custom Knobs
                  </button>
                </div>
              </div>

              {/* ACTIVE PRESET OVERVIEW / CONTROLS PANEL */}
              {activeTab === 'presets' && (
                <div className="space-y-5 animate-fade-in">
                  
                  {/* Current Active Preset Card banner */}
                  <div className="bg-[#24201b] border border-[#3e362e] rounded-xl p-4 flex items-start space-x-3.5 shadow-inner">
                    <div className="p-2.5 bg-amber-950/40 border border-amber-900 rounded-lg text-amber-500 mt-0.5">
                      <Sparkles className="w-5 h-5" />
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-white font-sans">{activePreset.name}</h4>
                      <p className="text-xs text-[#a39785] mt-1 leading-relaxed">{activePreset.description}</p>
                    </div>
                  </div>

                  {/* Preset Search/Filter Bar */}
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <Search className="w-4 h-4 text-[#8e816d]" />
                    </div>
                    <input
                      type="text"
                      placeholder="Search presets... (e.g. Study, Vinyl, Cassette, Radio)"
                      value={presetSearchQuery}
                      onChange={(e) => setPresetSearchQuery(e.target.value)}
                      className="w-full bg-[#11100e] text-white placeholder-[#8e816d] text-xs font-mono rounded-xl pl-9 pr-14 py-2 border border-[#2d2822] focus:border-amber-500/50 focus:outline-none focus:ring-1 focus:ring-amber-500/30 transition"
                    />
                    {presetSearchQuery && (
                      <button
                        onClick={() => setPresetSearchQuery('')}
                        className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-[10px] font-mono text-amber-500 hover:text-amber-400 font-bold"
                      >
                        CLEAR
                      </button>
                    )}
                  </div>

                  {/* Presets Grid */}
                  {(() => {
                    const filtered = PRESETS.filter(p => 
                      p.name.toLowerCase().includes(presetSearchQuery.toLowerCase()) ||
                      p.description.toLowerCase().includes(presetSearchQuery.toLowerCase())
                    );
                    if (filtered.length === 0) {
                      return (
                        <div className="text-center py-8 bg-[#12110f] rounded-xl border border-[#25211c] border-dashed space-y-2">
                          <p className="text-xs font-mono text-[#8e816d]">No matching lofi presets found</p>
                          <button
                            onClick={() => setPresetSearchQuery('')}
                            className="text-[10px] font-mono font-bold bg-[#1d1a16] px-3 py-1.5 rounded-lg border border-[#2d2822] text-amber-500 hover:text-amber-400 hover:border-[#3e362e] transition"
                          >
                            Reset Search
                          </button>
                        </div>
                      );
                    }
                    return (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {filtered.map((preset) => (
                          <button
                            key={preset.id}
                            onClick={() => selectPreset(preset)}
                            className={`p-4 rounded-xl text-left border transition flex flex-col justify-between h-32 ${
                              activePreset.id === preset.id
                                ? 'bg-amber-950/15 border-amber-500/80 shadow-[0_0_12px_rgba(245,158,11,0.1)]'
                                : 'bg-[#12110f] border-[#25211c] hover:border-[#3a332a] hover:bg-[#1a1714]'
                            }`}
                          >
                            <div className="space-y-1">
                              <div className="flex justify-between items-center">
                                <span className="text-xs font-bold text-white">{preset.name}</span>
                                {activePreset.id === preset.id && (
                                  <CheckCircle className="w-3.5 h-3.5 text-amber-500" />
                                )}
                              </div>
                              <p className="text-[11px] text-[#8e816d] leading-relaxed line-clamp-2">
                                {preset.description}
                              </p>
                            </div>

                            {/* Sparkline simulation of DSP stats */}
                            <div className="flex items-center space-x-2 text-[10px] font-mono text-[#a39785] pt-2 border-t border-[#25211c] w-full">
                              <span className="bg-[#1d1a16] px-1.5 py-0.5 rounded text-[9px] border border-[#2d2822]">
                                EQ Cut: {preset.filterCutoff}Hz
                              </span>
                              <span className="bg-[#1d1a16] px-1.5 py-0.5 rounded text-[9px] border border-[#2d2822]">
                                Drive: {preset.saturationDrive}%
                              </span>
                            </div>
                          </button>
                        ))}
                      </div>
                    );
                  })()}

                  {/* Switch file option */}
                  <div className="flex justify-between items-center pt-4 border-t border-[#2d2822]">
                    <div className="flex items-center space-x-2 text-[11px] font-mono text-[#a39785]">
                      <FileAudio className="w-4 h-4 text-amber-500" />
                      <span className="truncate max-w-xs">{playerState.fileName}</span>
                    </div>
                    <label className="text-[11px] font-mono font-bold text-amber-500 hover:text-amber-400 cursor-pointer underline">
                      LOAD ANOTHER TAPE
                      <input 
                        type="file" 
                        accept="audio/*" 
                        onChange={handleFileChange} 
                        className="hidden" 
                      />
                    </label>
                  </div>

                </div>
              )}

              {/* MANUAL ADJUST SLIDERS PANEL */}
              {activeTab === 'knobs' && (
                <div className="space-y-6 animate-fade-in">
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-y-5 gap-x-6">
                    
                    {/* Tape Speed & Pitch (Semitones) */}
                    <div className="space-y-1.5">
                      <div className="flex justify-between items-center text-xs font-mono text-[#cfc4b2]">
                        <span className="flex items-center">
                          <Sliders className="w-3.5 h-3.5 mr-1 text-amber-500" />
                          Tape Speed & Pitch (Semitones)
                        </span>
                        <span className="text-amber-500">
                          {currentKnobs.semitones > 0 ? `+${currentKnobs.semitones}` : currentKnobs.semitones} semitones ({Math.round(Math.pow(2, currentKnobs.semitones / 12) * 100)}% speed)
                        </span>
                      </div>
                      <input
                        type="range"
                        min="-6"
                        max="2"
                        step="0.5"
                        value={currentKnobs.semitones}
                        onChange={(e) => updateKnobValue('semitones', parseFloat(e.target.value))}
                        className="w-full accent-amber-500 h-1.5 bg-[#11100e] rounded-lg border border-[#2d2822] cursor-pointer"
                      />
                      <p className="text-[10px] text-[#8e816d] leading-normal font-sans">Slowing down tape drops the tempo and pitch, making the audio incredibly warm, laid-back, and dreamlike.</p>
                    </div>

                    {/* Filter Cutoff */}
                    <div className="space-y-1.5">
                      <div className="flex justify-between items-center text-xs font-mono text-[#cfc4b2]">
                        <span className="flex items-center">
                          <Layers className="w-3.5 h-3.5 mr-1 text-amber-500" />
                          Filter EQ Cutoff
                        </span>
                        <span className="text-amber-500">{currentKnobs.filterCutoff} Hz</span>
                      </div>
                      <input
                        type="range"
                        min="200"
                        max="8000"
                        step="20"
                        value={currentKnobs.filterCutoff}
                        onChange={(e) => updateKnobValue('filterCutoff', parseInt(e.target.value))}
                        className="w-full accent-amber-500 h-1.5 bg-[#11100e] rounded-lg border border-[#2d2822] cursor-pointer"
                      />
                      <p className="text-[10px] text-[#8e816d] leading-normal font-sans">Mutes higher frequencies to make audio dark & distant.</p>
                    </div>

                    {/* Saturation Drive */}
                    <div className="space-y-1.5">
                      <div className="flex justify-between items-center text-xs font-mono text-[#cfc4b2]">
                        <span className="flex items-center">
                          <Sparkles className="w-3.5 h-3.5 mr-1 text-amber-500" />
                          Tape Saturation
                        </span>
                        <span className="text-amber-500">{currentKnobs.saturationDrive}%</span>
                      </div>
                      <input
                        type="range"
                        min="0"
                        max="100"
                        step="1"
                        value={currentKnobs.saturationDrive}
                        onChange={(e) => updateKnobValue('saturationDrive', parseInt(e.target.value))}
                        className="w-full accent-amber-500 h-1.5 bg-[#11100e] rounded-lg border border-[#2d2822] cursor-pointer"
                      />
                      <p className="text-[10px] text-[#8e816d] leading-normal font-sans">Applies soft-clipping <code className="font-mono text-amber-600/90">tanh</code> saturation for warm harmonic compression.</p>
                    </div>

                    {/* Wow & Flutter Pitch Wobble */}
                    <div className="space-y-1.5">
                      <div className="flex justify-between items-center text-xs font-mono text-[#cfc4b2]">
                        <span className="flex items-center">
                          <Radio className="w-3.5 h-3.5 mr-1 text-amber-500" />
                          Pitch Wow / Wobble
                        </span>
                        <span className="text-amber-500">{currentKnobs.wowDepth}%</span>
                      </div>
                      <input
                        type="range"
                        min="0"
                        max="100"
                        step="1"
                        value={currentKnobs.wowDepth}
                        onChange={(e) => updateKnobValue('wowDepth', parseInt(e.target.value))}
                        className="w-full accent-amber-500 h-1.5 bg-[#11100e] rounded-lg border border-[#2d2822] cursor-pointer"
                      />
                      <p className="text-[10px] text-[#8e816d] leading-normal font-sans">Simulates wow & flutter tape stretch. Introduces slow drift.</p>
                    </div>

                    {/* Vinyl Crackle */}
                    <div className="space-y-1.5">
                      <div className="flex justify-between items-center text-xs font-mono text-[#cfc4b2]">
                        <span className="flex items-center">
                          <Sliders className="w-3.5 h-3.5 mr-1 text-amber-500" />
                          Vinyl Dust Crackle
                        </span>
                        <span className="text-amber-500">{currentKnobs.crackleLevel}%</span>
                      </div>
                      <input
                        type="range"
                        min="0"
                        max="100"
                        step="1"
                        value={currentKnobs.crackleLevel}
                        onChange={(e) => updateKnobValue('crackleLevel', parseInt(e.target.value))}
                        className="w-full accent-amber-500 h-1.5 bg-[#11100e] rounded-lg border border-[#2d2822] cursor-pointer"
                      />
                      <p className="text-[10px] text-[#8e816d] leading-normal font-sans">Generates procedural dust clicks and crackling record surface noises.</p>
                    </div>

                    {/* Tape Hiss */}
                    <div className="space-y-1.5">
                      <div className="flex justify-between items-center text-xs font-mono text-[#cfc4b2]">
                        <span className="flex items-center">
                          <Volume2 className="w-3.5 h-3.5 mr-1 text-amber-500" />
                          Magnetic Tape Hiss
                        </span>
                        <span className="text-amber-500">{currentKnobs.hissLevel}%</span>
                      </div>
                      <input
                        type="range"
                        min="0"
                        max="100"
                        step="1"
                        value={currentKnobs.hissLevel}
                        onChange={(e) => updateKnobValue('hissLevel', parseInt(e.target.value))}
                        className="w-full accent-amber-500 h-1.5 bg-[#11100e] rounded-lg border border-[#2d2822] cursor-pointer"
                      />
                      <p className="text-[10px] text-[#8e816d] leading-normal font-sans">Loops a procedural thermal white-noise hiss focused on mid frequencies.</p>
                    </div>

                    {/* Stereo Width */}
                    <div className="space-y-1.5">
                      <div className="flex justify-between items-center text-xs font-mono text-[#cfc4b2]">
                        <span className="flex items-center">
                          <Info className="w-3.5 h-3.5 mr-1 text-amber-500" />
                          Stereo Width Field
                        </span>
                        <span className="text-amber-500">{currentKnobs.stereoWidth}%</span>
                      </div>
                      <input
                        type="range"
                        min="0"
                        max="100"
                        step="1"
                        value={currentKnobs.stereoWidth}
                        onChange={(e) => updateKnobValue('stereoWidth', parseInt(e.target.value))}
                        className="w-full accent-amber-500 h-1.5 bg-[#11100e] rounded-lg border border-[#2d2822] cursor-pointer"
                      />
                      <p className="text-[10px] text-[#8e816d] leading-normal font-sans">Reduces width (0% = pure mono) to simulate historical vintage speaker setups.</p>
                    </div>

                    {/* Delay Feedback */}
                    <div className="space-y-1.5">
                      <div className="flex justify-between items-center text-xs font-mono text-[#cfc4b2]">
                        <span className="flex items-center">
                          <Music className="w-3.5 h-3.5 mr-1 text-amber-500" />
                          Echo Space Delay
                        </span>
                        <span className="text-amber-500">{currentKnobs.delayFeedback}%</span>
                      </div>
                      <input
                        type="range"
                        min="0"
                        max="100"
                        step="1"
                        value={currentKnobs.delayFeedback}
                        onChange={(e) => updateKnobValue('delayFeedback', parseInt(e.target.value))}
                        className="w-full accent-amber-500 h-1.5 bg-[#11100e] rounded-lg border border-[#2d2822] cursor-pointer"
                      />
                      <p className="text-[10px] text-[#8e816d] leading-normal font-sans">Adds warm tape-style echo feedback to create melancholic space.</p>
                    </div>

                    {/* Soulful Reverb (Level) */}
                    <div className="space-y-1.5">
                      <div className="flex justify-between items-center text-xs font-mono text-[#cfc4b2]">
                        <span className="flex items-center">
                          <Sparkles className="w-3.5 h-3.5 mr-1 text-pink-500" />
                          Soulful Spatial Reverb (Level)
                        </span>
                        <span className="text-pink-400 font-bold">{currentKnobs.reverbLevel}%</span>
                      </div>
                      <input
                        type="range"
                        min="0"
                        max="100"
                        step="1"
                        value={currentKnobs.reverbLevel}
                        onChange={(e) => updateKnobValue('reverbLevel', parseInt(e.target.value))}
                        className="w-full accent-pink-500 h-1.5 bg-[#11100e] rounded-lg border border-[#2d2822] cursor-pointer"
                      />
                      <p className="text-[10px] text-[#8e816d] leading-normal font-sans">
                        Dials in a gorgeous, silky stereo-decay reverb sending mids/highs while keeping sub-bass dry.
                      </p>
                    </div>

                    {/* Reverb Room Size (Decay) */}
                    <div className="space-y-1.5">
                      <div className="flex justify-between items-center text-xs font-mono text-[#cfc4b2]">
                        <span className="flex items-center">
                          <Activity className="w-3.5 h-3.5 mr-1 text-pink-500" />
                          Reverb Space Size (Decay)
                        </span>
                        <span className="text-pink-400 font-bold">{(0.5 + (currentKnobs.reverbSize / 100) * 3.0).toFixed(1)}s Decay</span>
                      </div>
                      <input
                        type="range"
                        min="0"
                        max="100"
                        step="1"
                        value={currentKnobs.reverbSize}
                        onChange={(e) => updateKnobValue('reverbSize', parseInt(e.target.value))}
                        className="w-full accent-pink-500 h-1.5 bg-[#11100e] rounded-lg border border-[#2d2822] cursor-pointer"
                      />
                      <p className="text-[10px] text-[#8e816d] leading-normal font-sans">
                        Regenerates a custom convolution buffer simulating warm retro concert halls and tape room sizes.
                      </p>
                    </div>

                    {/* Vintage Microphone Convolution */}
                    <div className="space-y-3.5 md:col-span-2 border-t border-[#2d2822]/40 pt-4 mt-2">
                      <div className="flex justify-between items-center text-xs font-mono text-[#cfc4b2]">
                        <span className="flex items-center font-bold">
                          <Mic className="w-3.5 h-3.5 mr-1.5 text-amber-500" />
                          Vintage Microphone IR Convolution Color
                        </span>
                        <span className="text-amber-400 font-bold">
                          {currentKnobs.micProfile === 'none' ? 'Bypassed' : `${currentKnobs.micAmount}% Color Blend`}
                        </span>
                      </div>
                      
                      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                        {[
                          { id: 'none', label: 'Bypass', desc: 'Flat Studio Line' },
                          { id: 'ribbon', label: 'Ribbon', desc: '1940s RCA Warm' },
                          { id: 'tube', label: 'Tube', desc: '1950s Condenser' },
                          { id: 'dynamic', label: 'Dynamic', desc: '1960s Shure 55' },
                          { id: 'carbon', label: 'Carbon', desc: '1920s Telephone' },
                        ].map((profile) => (
                          <button
                            key={profile.id}
                            type="button"
                            onClick={() => {
                              updateKnobValue('micProfile', profile.id);
                            }}
                            className={`p-2 rounded-lg border text-left transition-all cursor-pointer flex flex-col justify-between h-14 ${
                              currentKnobs.micProfile === profile.id
                                ? 'bg-amber-950/20 border-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.15)]'
                                : 'bg-[#11100e] border-[#2d2822] hover:border-[#443c33] text-gray-400 hover:text-gray-200'
                            }`}
                          >
                            <p className={`text-[10px] font-mono font-bold leading-tight ${currentKnobs.micProfile === profile.id ? 'text-amber-400' : 'text-[#cfc4b2]'}`}>
                              {profile.label}
                            </p>
                            <p className="text-[9px] text-[#8e816d] leading-normal font-sans">{profile.desc}</p>
                          </button>
                        ))}
                      </div>

                      <div className="space-y-1.5">
                        <input
                          type="range"
                          min="0"
                          max="100"
                          step="1"
                          value={currentKnobs.micAmount}
                          disabled={currentKnobs.micProfile === 'none'}
                          onChange={(e) => updateKnobValue('micAmount', parseInt(e.target.value))}
                          className="w-full accent-amber-500 h-1.5 bg-[#11100e] rounded-lg border border-[#2d2822] cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
                        />
                        <p className="text-[10px] text-[#8e816d] leading-normal font-sans">
                          Convolves the signal with high-fidelity vintage microphone models to capture warm ribbon roll-offs, tube harmonics, or high-impedance telephone carbon grit.
                        </p>
                      </div>
                    </div>

                    {/* Soulful Instrument Separation EQ (Clarity) */}
                    <div className="space-y-1.5 md:col-span-2 border-t border-[#2d2822]/40 pt-4 mt-2">
                      <div className="flex justify-between items-center text-xs font-mono text-[#cfc4b2]">
                        <span className="flex items-center font-bold">
                          <CheckCircle className="w-3.5 h-3.5 mr-1.5 text-emerald-500" />
                          Soulful Clarity & Instrument Separation EQ
                        </span>
                        <span className="text-emerald-400 font-bold">{currentKnobs.soulfulClarity}% Clarity</span>
                      </div>
                      <input
                        type="range"
                        min="0"
                        max="100"
                        step="1"
                        value={currentKnobs.soulfulClarity}
                        onChange={(e) => updateKnobValue('soulfulClarity', parseInt(e.target.value))}
                        className="w-full accent-emerald-500 h-1.5 bg-[#11100e] rounded-lg border border-[#2d2822] cursor-pointer"
                      />
                      <p className="text-[10px] text-[#8e816d] leading-normal font-sans">
                        Removes muddy boxiness in the low-mids (peaking cut at 350Hz) to perfectly separate acoustic guitars, pianos, and vocals from the rhythm, while boosting warm sub-bass (80Hz) and adding silky analog air (6000Hz) to make the track breathe.
                      </p>
                    </div>

                    {/* Golden Lofi Sub-Bass Boost */}
                    <div className="space-y-1.5 md:col-span-2 border-t border-[#2d2822]/40 pt-4 mt-2">
                      <div className="flex justify-between items-center text-xs font-mono text-[#cfc4b2]">
                        <span className="flex items-center font-bold">
                          <Disc className="w-3.5 h-3.5 mr-1.5 text-amber-500 animate-[spin_6s_linear_infinite]" />
                          Cozy Sub-Bass Boost (Analog Warmth)
                        </span>
                        <span className="text-amber-400 font-bold">{currentKnobs.bassBoost}% Boost</span>
                      </div>
                      <input
                        type="range"
                        min="0"
                        max="100"
                        step="1"
                        value={currentKnobs.bassBoost}
                        onChange={(e) => updateKnobValue('bassBoost', parseInt(e.target.value))}
                        className="w-full accent-amber-500 h-1.5 bg-[#11100e] rounded-lg border border-[#2d2822] cursor-pointer"
                      />
                      <p className="text-[10px] text-[#8e816d] leading-normal font-sans">
                        Pumps a warm analog low-shelf boost at 65Hz to deliver thick, comforting low-end weight without muddiness or distortion. Perfect for study vibes.
                      </p>
                    </div>

                    {/* Cozy Jazz Harmonics Color */}
                    <div className="space-y-1.5 md:col-span-2 border-t border-[#2d2822]/40 pt-4 mt-2">
                      <div className="flex justify-between items-center text-xs font-mono text-[#cfc4b2]">
                        <span className="flex items-center font-bold">
                          <Music className="w-3.5 h-3.5 mr-1.5 text-pink-400" />
                          Jazz Harmony & Cozy Color Filter
                        </span>
                        <span className="text-pink-400 font-bold">{currentKnobs.jazzColor}% Jazz Color</span>
                      </div>
                      <input
                        type="range"
                        min="0"
                        max="100"
                        step="1"
                        value={currentKnobs.jazzColor}
                        onChange={(e) => updateKnobValue('jazzColor', parseInt(e.target.value))}
                        className="w-full accent-pink-500 h-1.5 bg-[#11100e] rounded-lg border border-[#2d2822] cursor-pointer"
                      />
                      <p className="text-[10px] text-[#8e816d] leading-normal font-sans">
                        Shapes mid-range presence around 1.5kHz to elevate jazzy brass, Rhodes keys, and guitar chords, while simultaneously rolling off fatiguing highs for a dusty, organic records tone.
                      </p>
                    </div>

                  </div>

                  {/* Preset Reset option */}
                  <div className="flex justify-between items-center pt-4 border-t border-[#2d2822]">
                    <span className="text-xs font-mono text-[#8e816d]">Custom mixing changes state immediately.</span>
                    <button
                      onClick={() => selectPreset(PRESETS[0])}
                      className="text-xs font-mono font-bold text-amber-500 hover:text-amber-400 flex items-center"
                    >
                      <RotateCcw className="w-3.5 h-3.5 mr-1" />
                      RESET TO DEFAULT PRESET
                    </button>
                  </div>

                </div>
              )}

            </div>
          )}

        </section>

      </main>
      ) : (
        /* OTHER DSP SUITE TOOLS */
        <main className="flex-grow max-w-7xl w-full mx-auto p-4 md:p-6 lg:p-8 animate-fade-in">
          {currentTool === 'vocal_remover' && <VocalRemover />}
          {currentTool === 'pitcher' && <PitcherTool />}
          {currentTool === 'key_bpm' && <KeyBpmFinder />}
          {currentTool === 'cutter' && <AudioCutter />}
          {currentTool === 'joiner' && <AudioJoiner />}
          {currentTool === 'recorder' && <VoiceRecorder />}
          {currentTool === 'slowed_reverb' && <SlowedReverb />}
          {currentTool === 'spatial_8d' && <Spatial8D />}
          {currentTool === 'audio_to_video' && <AudioToVideo />}
        </main>
      )}

      {/* SEO & FEATURE LANDING SUITE SECTION */}
      <section className="max-w-4xl mx-auto px-6 pb-16 pt-8 border-t border-[#2d2822]/40 space-y-10 z-10 relative">
        <div className="text-center space-y-3">
          <h2 className="text-xl md:text-2xl font-bold font-sans tracking-tight text-[#cfc4b2]">
            Online Audio Effects & Vintage Lofi Converter Suite
          </h2>
          <p className="text-xs text-[#8e816d] max-w-2xl mx-auto leading-relaxed font-sans">
            A professional browser-based audio station for vintage lofi generation, real-time vocal pitch shifting, and tape emulation. All audio signal processing runs locally in real-time.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Feature Card 1 */}
          <div className="p-5 rounded-2xl bg-[#11100e] border border-[#2d2822] space-y-3">
            <div className="flex items-center space-x-2">
              <div className="p-1.5 rounded-lg bg-amber-500/10 text-amber-500">
                <Music className="w-4 h-4" />
              </div>
              <h3 className="text-sm font-bold text-white font-mono uppercase tracking-wider">
                Lofi Converter & Generator
              </h3>
            </div>
            <p className="text-[11px] text-[#8e816d] leading-relaxed font-sans">
              Instantly convert standard MP3, WAV, or FLAC files into high-quality vintage lofi tracks. Apply real-time lofi filters, cassette noise, vinyl crackle, and customized ambient reverb to recreate the classic aesthetic of low-fidelity chillhop beats.
            </p>
            <div className="flex flex-wrap gap-1.5 pt-1">
              <span className="text-[9px] font-mono bg-[#1a1816] text-[#a39785] px-2 py-0.5 rounded border border-[#2d2822]/60">lofi maker</span>
              <span className="text-[9px] font-mono bg-[#1a1816] text-[#a39785] px-2 py-0.5 rounded border border-[#2d2822]/60">lofi filter online</span>
              <span className="text-[9px] font-mono bg-[#1a1816] text-[#a39785] px-2 py-0.5 rounded border border-[#2d2822]/60">free lofi generator</span>
            </div>
          </div>

          {/* Feature Card 2 */}
          <div className="p-5 rounded-2xl bg-[#11100e] border border-[#2d2822] space-y-3">
            <div className="flex items-center space-x-2">
              <div className="p-1.5 rounded-lg bg-pink-500/10 text-pink-500">
                <Mic className="w-4 h-4" />
              </div>
              <h3 className="text-sm font-bold text-white font-mono uppercase tracking-wider">
                Vocal Pitch Shifter & Formant Effect
              </h3>
            </div>
            <p className="text-[11px] text-[#8e816d] leading-relaxed font-sans">
              Transpose vocals with a high-fidelity pitch shifter and real-time formant filter. Perform male-to-female and female-to-male vocal transformations or fine-tune individual semitones to create signature vocal chops and modern vocal melodies.
            </p>
            <div className="flex flex-wrap gap-1.5 pt-1">
              <span className="text-[9px] font-mono bg-[#1a1816] text-[#a39785] px-2 py-0.5 rounded border border-[#2d2822]/60">vocal effects online</span>
              <span className="text-[9px] font-mono bg-[#1a1816] text-[#a39785] px-2 py-0.5 rounded border border-[#2d2822]/60">online pitch shifter</span>
              <span className="text-[9px] font-mono bg-[#1a1816] text-[#a39785] px-2 py-0.5 rounded border border-[#2d2822]/60">vocal generator</span>
            </div>
          </div>

          {/* Feature Card 3 */}
          <div className="p-5 rounded-2xl bg-[#11100e] border border-[#2d2822] space-y-3">
            <div className="flex items-center space-x-2">
              <div className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-500">
                <Sliders className="w-4 h-4" />
              </div>
              <h3 className="text-sm font-bold text-white font-mono uppercase tracking-wider">
                Analog Tape Saturation
              </h3>
            </div>
            <p className="text-[11px] text-[#8e816d] leading-relaxed font-sans">
              Emulate the harmonic warmth of high-end analog tape recorders. Add soft-clipping tape drive, natural saturation, tape hiss, and wow & flutter speed deviations to capture the genuine organic character of 1990s retro cassette decks.
            </p>
            <div className="flex flex-wrap gap-1.5 pt-1">
              <span className="text-[9px] font-mono bg-[#1a1816] text-[#a39785] px-2 py-0.5 rounded border border-[#2d2822]/60">tape saturation vst online</span>
              <span className="text-[9px] font-mono bg-[#1a1816] text-[#a39785] px-2 py-0.5 rounded border border-[#2d2822]/60">audio distortion tool</span>
              <span className="text-[9px] font-mono bg-[#1a1816] text-[#a39785] px-2 py-0.5 rounded border border-[#2d2822]/60">cassette emulator</span>
            </div>
          </div>

          {/* Feature Card 4 */}
          <div className="p-5 rounded-2xl bg-[#11100e] border border-[#2d2822] space-y-3">
            <div className="flex items-center space-x-2">
              <div className="p-1.5 rounded-lg bg-amber-500/10 text-amber-500">
                <Search className="w-4 h-4" />
              </div>
              <h3 className="text-sm font-bold text-white font-mono uppercase tracking-wider">
                Audio Detector & Master Export
              </h3>
            </div>
            <p className="text-[11px] text-[#8e816d] leading-relaxed font-sans">
              Detect audio BPM and key automatically using our built-in real-time tempo analyzer and musical scale lock. Export your finished custom creations to high-fidelity WAV or MP3 files ready to be used in your creative projects.
            </p>
            <div className="flex flex-wrap gap-1.5 pt-1">
              <span className="text-[9px] font-mono bg-[#1a1816] text-[#a39785] px-2 py-0.5 rounded border border-[#2d2822]/60">bpm finder online</span>
              <span className="text-[9px] font-mono bg-[#1a1816] text-[#a39785] px-2 py-0.5 rounded border border-[#2d2822]/60">export audio stem</span>
              <span className="text-[9px] font-mono bg-[#1a1816] text-[#a39785] px-2 py-0.5 rounded border border-[#2d2822]/60">wav converter online</span>
            </div>
          </div>

          {/* Feature Card 5 - Slowed & Reverb */}
          <div className="p-5 rounded-2xl bg-[#11100e] border border-[#2d2822] space-y-3">
            <div className="flex items-center space-x-2">
              <div className="p-1.5 rounded-lg bg-amber-500/10 text-amber-500">
                <Activity className="w-4 h-4" />
              </div>
              <h3 className="text-sm font-bold text-white font-mono uppercase tracking-wider">
                Slowed & Reverb Online Generator
              </h3>
            </div>
            <p className="text-[11px] text-[#8e816d] leading-relaxed font-sans">
              Instantly create aesthetic slowed and reverbed versions of your favorite tracks. Adjust pitch, stretch tempo, apply high-cut frequency dampening, boost the 808 sub bass, and introduce majestic room or cathedral convolutions in a single tap.
            </p>
            <div className="flex flex-wrap gap-1.5 pt-1">
              <span className="text-[9px] font-mono bg-[#1a1816] text-[#a39785] px-2 py-0.5 rounded border border-[#2d2822]/60">slowed and reverb maker</span>
              <span className="text-[9px] font-mono bg-[#1a1816] text-[#a39785] px-2 py-0.5 rounded border border-[#2d2822]/60">slowed song converter</span>
              <span className="text-[9px] font-mono bg-[#1a1816] text-[#a39785] px-2 py-0.5 rounded border border-[#2d2822]/60">vaporwave reverb online</span>
            </div>
          </div>

          {/* Feature Card 6 - 8D Audio */}
          <div className="p-5 rounded-2xl bg-[#11100e] border border-[#2d2822] space-y-3">
            <div className="flex items-center space-x-2">
              <div className="p-1.5 rounded-lg bg-orange-500/10 text-orange-500">
                <Disc className="w-4 h-4" />
              </div>
              <h3 className="text-sm font-bold text-white font-mono uppercase tracking-wider">
                360° 8D Audio Spatializer
              </h3>
            </div>
            <p className="text-[11px] text-[#8e816d] leading-relaxed font-sans">
              Experience sound rotating around your head. This tool sweeps stereo audio between left and right channels using precise Low Frequency Oscillators (LFO) on a Web Audio Panner node. Ideal for headphones, study, and sensory sleep vibes.
            </p>
            <div className="flex flex-wrap gap-1.5 pt-1">
              <span className="text-[9px] font-mono bg-[#1a1816] text-[#a39785] px-2 py-0.5 rounded border border-[#2d2822]/60">8d audio maker</span>
              <span className="text-[9px] font-mono bg-[#1a1816] text-[#a39785] px-2 py-0.5 rounded border border-[#2d2822]/60">online 8d converter</span>
              <span className="text-[9px] font-mono bg-[#1a1816] text-[#a39785] px-2 py-0.5 rounded border border-[#2d2822]/60">binaural sound panner</span>
            </div>
          </div>

          {/* Feature Card 7 - Audio to Video */}
          <div className="p-5 rounded-2xl bg-[#11100e] border border-[#2d2822] space-y-3 md:col-span-2">
            <div className="flex items-center space-x-2">
              <div className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-500">
                <Video className="w-4 h-4" />
              </div>
              <h3 className="text-sm font-bold text-white font-mono uppercase tracking-wider">
                Reactive Audio Visualizer to Video Exporter
              </h3>
            </div>
            <p className="text-[11px] text-[#8e816d] leading-relaxed font-sans">
              Convert your lofi beats or songs directly into full-length video files! Choose between responsive Retro Sunsets, spinning vinyls, cyber grids or neon line waves. Customize the labels and export HD video files ready for YouTube, TikTok, or Instagram reels.
            </p>
            <div className="flex flex-wrap gap-1.5 pt-1">
              <span className="text-[9px] font-mono bg-[#1a1816] text-[#a39785] px-2 py-0.5 rounded border border-[#2d2822]/60">audio to video visualizer</span>
              <span className="text-[9px] font-mono bg-[#1a1816] text-[#a39785] px-2 py-0.5 rounded border border-[#2d2822]/60">render visualizer mp4</span>
              <span className="text-[9px] font-mono bg-[#1a1816] text-[#a39785] px-2 py-0.5 rounded border border-[#2d2822]/60">music to video converter online</span>
            </div>
          </div>

        </div>

        {/* Quick FAQ / SEO section */}
        <div className="p-6 rounded-2xl bg-[#0e0d0c] border border-[#2d2822]/60 space-y-4">
          <h3 className="text-xs font-bold font-mono text-[#cfc4b2] uppercase tracking-wider">Frequently Asked Questions</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-[11px] leading-relaxed text-[#8e816d] font-sans">
            <div className="space-y-1">
              <h4 className="font-bold text-[#a39785]">How does the online lofi generator work?</h4>
              <p>Our app leverages the Web Audio API to process and apply tape emulation, distortion, filters, and vinyl crackles in your browser. This removes server lag and makes conversion instantaneous.</p>
            </div>
            <div className="space-y-1">
              <h4 className="font-bold text-[#a39785]">Are these online audio effects royalty-free?</h4>
              <p>Yes, all processed outputs are completely royalty-free for creative, commercial, or personal music production and distribution.</p>
            </div>
          </div>
        </div>
      </section>

      {/* EXPORT OVERLAY LOADER MODAL */}
      {playerState.isExporting && (
        <div className="fixed inset-0 bg-[#0d0c0b]/90 backdrop-blur-md flex items-center justify-center z-50">
          <div className="bg-[#1a1714] border border-[#302b24] rounded-2xl p-8 max-w-sm w-full mx-4 shadow-2xl text-center space-y-5 animate-scale-up">
            
            {/* Spinning reel mockup for loading */}
            <div className="relative w-20 h-20 mx-auto bg-[#0d0c0b] rounded-full border-2 border-amber-600 flex items-center justify-center shadow-[0_0_15px_rgba(217,119,6,0.3)]">
              <Radio className="w-8 h-8 text-amber-500 animate-spin" />
            </div>

            <div className="space-y-1.5">
              <h3 className="text-base font-bold text-white uppercase tracking-wider">Rendering Vintage Lofi File</h3>
              <p className="text-xs text-[#a39785] font-mono">Compiling DSP Signal Chain & Mixing Master PCM...</p>
            </div>

            {/* Custom linear progress bar */}
            <div className="space-y-1">
              <div className="w-full h-2 rounded-full bg-[#11100e] border border-[#2c261e] overflow-hidden">
                <div 
                  className="h-full bg-amber-500 rounded-full transition-all duration-150 shadow-[0_0_8px_rgba(217,119,6,0.5)]"
                  style={{ width: `${playerState.exportProgress * 100}%` }}
                />
              </div>
              <div className="flex justify-between text-[10px] font-mono text-amber-500">
                <span>EXPORT PROGRESS</span>
                <span>{Math.floor(playerState.exportProgress * 100)}%</span>
              </div>
            </div>

            <p className="text-[10px] text-[#746957] leading-relaxed">
              Applying wow, flutter, soft-clipping tape saturator, procedural tape hiss, and 16-bit PCM master packing.
            </p>
          </div>
        </div>
      )}

      {/* ALL TOOLS LINK MAP (crawlable internal links) */}
      <nav aria-label="All audio tools" className="border-t border-[#2d2822] bg-[#12100e] px-6 py-5">
        <div className="max-w-7xl mx-auto space-y-3">
          <h2 className="text-[10px] font-mono font-bold tracking-widest text-[#8e816d] uppercase">All Free Audio Tools</h2>
          <div className="flex flex-wrap gap-x-5 gap-y-2">
            {SEO_PAGES.map(page => (
              <a
                key={page.toolId}
                href={page.path}
                className={`text-[11px] font-mono transition ${
                  currentTool === page.toolId
                    ? 'text-amber-500 font-bold'
                    : 'text-[#a39785] hover:text-white'
                }`}
                onClick={(e) => {
                  e.preventDefault();
                  selectTool(page.toolId as ToolId);
                }}
              >
                {page.h1}
              </a>
            ))}
          </div>
        </div>
      </nav>

      {/* FOOTER */}
      <footer className="border-t border-[#2d2822] bg-[#100e0d] px-6 py-4 flex flex-col md:flex-row justify-between items-center text-xs text-[#746957] font-mono z-10">
        <div className="flex items-center space-x-1">
          <span>&copy; {new Date().getFullYear()}</span>
          <span className="text-[#a39785]">Lofi Audio Converter.</span>
          <span>All DSP signal modulation happens locally.</span>
        </div>
        <div className="mt-2 md:mt-0 flex space-x-4">
          <span className="flex items-center">
            <span className="w-2 h-2 rounded-full bg-emerald-500 mr-1.5 animate-pulse" />
            WASM-ACCELERATED PREVIEW
          </span>
          <span>STABLE CHANNEL v1.0.4</span>
        </div>
      </footer>

    </div>
  );
}
