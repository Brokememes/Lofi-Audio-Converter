import React, { useState, useRef, useEffect } from 'react';
import {
  Play,
  Pause,
  Volume2,
  Download,
  Trash2,
  Sliders,
  Activity,
  Music,
  Gauge,
  Sparkles,
  RefreshCw,
  TrendingDown,
  UserRound
} from 'lucide-react';
import { TimeDomainPitchShifter, detectVocalGender } from '../audioEngine';

// Slowing playback drops pitch AND formants together (like a tape running
// slow) - this is what makes a slowed female vocal start reading as male.
// This computes how many semitones a given speed% drops the pitch by.
function getSpeedInducedSemitoneDrop(speedPercent: number): number {
  return 12 * Math.log2(speedPercent / 100);
}

// Create a high-quality programmatic impulse response for spacious reverb
function createReverbImpulseResponse(ctx: BaseAudioContext, duration: number, decay: number): AudioBuffer {
  const sampleRate = ctx.sampleRate;
  const length = sampleRate * duration;
  const impulse = ctx.createBuffer(2, length, sampleRate);
  
  const left = impulse.getChannelData(0);
  const right = impulse.getChannelData(1);
  
  for (let i = 0; i < length; i++) {
    const percent = i / length;
    // Exponential decay
    const l = (Math.random() * 2 - 1) * Math.pow(1 - percent, decay);
    // Slight phase difference for rich stereo width
    const r = (Math.random() * 2 - 1) * Math.pow(1 - percent, decay);
    
    // High-frequency damping
    const damp = 1 - (percent * 0.5);
    left[i] = l * damp;
    right[i] = r * damp;
  }
  
  return impulse;
}

export default function SlowedReverb() {
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [audioBuffer, setAudioBuffer] = useState<AudioBuffer | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);

  // FX Parameters
  const [speed, setSpeed] = useState(85); // 70% to 100%
  const [reverbMix, setReverbMix] = useState(45); // 0% to 100%
  const [reverbSize, setReverbSize] = useState(3.5); // 1.0s to 7.0s
  const [highCut, setHighCut] = useState(4000); // 1000Hz to 20000Hz
  const [bassBoost, setBassBoost] = useState(6); // 0dB to 15dB
  const [volume, setVolume] = useState(80);
  // Restores the pitch/formant drop that slowing playback causes, so vocals
  // don't read as a different gender. 100% = fully corrected pitch (singer
  // sounds like themselves, only tempo is slowed), 0% = full vari-speed drop
  // (classic deep tape-slowdown character).
  const [vocalPitchLift, setVocalPitchLift] = useState(100);
  const [voiceType, setVoiceType] = useState<'female' | 'male' | 'custom'>('female');
  // 'female'/'male' = confident auto-detection; 'unknown' = couldn't tell
  // (defaults to female); null = no file analyzed yet
  const [detectedVoice, setDetectedVoice] = useState<'female' | 'male' | 'unknown' | null>(null);

  const selectVoiceType = (type: 'female' | 'male') => {
    setVoiceType(type);
    // Female: fully restore pitch so she still sounds like herself.
    // Male: keep the full deep drop — the classic slowed sound suits male vocals.
    setVocalPitchLift(type === 'female' ? 100 : 0);
  };

  // Audio nodes and context refs
  const audioCtxRef = useRef<AudioContext | null>(null);
  const sourceNodeRef = useRef<AudioBufferSourceNode | null>(null);
  const pitchShifterRef = useRef<TimeDomainPitchShifter | null>(null);
  const reverbNodeRef = useRef<ConvolverNode | null>(null);
  const dryGainRef = useRef<GainNode | null>(null);
  const wetGainRef = useRef<GainNode | null>(null);
  const filterNodeRef = useRef<BiquadFilterNode | null>(null);
  const bassBoostNodeRef = useRef<BiquadFilterNode | null>(null);
  const masterGainRef = useRef<GainNode | null>(null);
  
  const animationFrameRef = useRef<number | null>(null);
  const startTimeRef = useRef<number>(0);
  const pausedTimeRef = useRef<number>(0);

  // Visualizer Ref
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);

  // Clean up
  useEffect(() => {
    return () => {
      stopPlayback();
      if (audioCtxRef.current) {
        audioCtxRef.current.close();
      }
    };
  }, []);

  // Update real-time Web Audio API node parameters
  useEffect(() => {
    if (!audioCtxRef.current) return;
    const t = audioCtxRef.current.currentTime;

    // 1. Playback speed
    if (sourceNodeRef.current) {
      sourceNodeRef.current.playbackRate.setTargetAtTime(speed / 100, t, 0.1);
    }

    // 1b. Vocal pitch lift compensation
    if (pitchShifterRef.current) {
      const drop = getSpeedInducedSemitoneDrop(speed);
      pitchShifterRef.current.setPitch(-drop * (vocalPitchLift / 100));
    }

    // 2. Reverb mix
    const mix = reverbMix / 100;
    if (dryGainRef.current && wetGainRef.current) {
      dryGainRef.current.gain.setTargetAtTime(1.0 - (mix * 0.3), t, 0.05); // slight dry drop at high mix
      wetGainRef.current.gain.setTargetAtTime(mix * 0.9, t, 0.05);
    }

    // 3. High cut lowpass filter
    if (filterNodeRef.current) {
      filterNodeRef.current.frequency.setTargetAtTime(highCut, t, 0.05);
    }

    // 4. Bass Boost low-shelf filter
    if (bassBoostNodeRef.current) {
      bassBoostNodeRef.current.gain.setTargetAtTime(bassBoost, t, 0.05);
    }

    // 5. Volume
    if (masterGainRef.current) {
      masterGainRef.current.gain.setTargetAtTime(volume / 100, t, 0.05);
    }
  }, [speed, reverbMix, highCut, bassBoost, volume, vocalPitchLift]);

  // Handle live reverb buffer generation when size changes
  useEffect(() => {
    if (!audioCtxRef.current || !reverbNodeRef.current) return;
    try {
      const impulse = createReverbImpulseResponse(audioCtxRef.current, reverbSize, 2.5);
      reverbNodeRef.current.buffer = impulse;
    } catch (e) {
      console.error("Error creating reverb size buffer live:", e);
    }
  }, [reverbSize]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    loadAudioFile(file);
  };

  const loadAudioFile = async (file: File) => {
    stopPlayback();
    setAudioFile(file);
    setIsProcessing(true);
    setAudioBuffer(null);

    try {
      if (!audioCtxRef.current) {
        audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      }

      const arrayBuffer = await file.arrayBuffer();
      // Use original context to decode
      const decodedBuffer = await audioCtxRef.current.decodeAudioData(arrayBuffer);
      setAudioBuffer(decodedBuffer);
      setDuration(decodedBuffer.duration);

      // Auto-detect the singer's voice so the pitch handling defaults to the
      // right behavior — user can still override with the voice buttons.
      const estimate = detectVocalGender(decodedBuffer);
      setDetectedVoice(estimate.gender);
      // Unknown defaults to female: restoring pitch is the safer choice
      // (a wrongly-deepened female voice is the common complaint).
      selectVoiceType(estimate.gender === 'male' ? 'male' : 'female');

      setIsProcessing(false);
    } catch (err) {
      console.error(err);
      alert('Error decoding audio file. Please try a valid MP3, WAV or FLAC.');
      setIsProcessing(false);
    }
  };

  // Start real-time audio graph
  const startPlayback = (timeOffset = 0) => {
    if (!audioCtxRef.current || !audioBuffer) return;

    if (audioCtxRef.current.state === 'suspended') {
      audioCtxRef.current.resume();
    }

    // Stop current active sound source
    if (sourceNodeRef.current) {
      try { sourceNodeRef.current.stop(); } catch (e) {}
      sourceNodeRef.current.disconnect();
    }

    const ctx = audioCtxRef.current;
    const t = ctx.currentTime;

    // Create Nodes
    const source = ctx.createBufferSource();
    source.buffer = audioBuffer;
    sourceNodeRef.current = source;

    // Vocal pitch lift: restores some of the pitch/formant drop caused by
    // slowing playback, applied after the slowdown so tempo is unaffected.
    const pitchShifter = new TimeDomainPitchShifter(ctx);
    const speedDrop = getSpeedInducedSemitoneDrop(speed);
    pitchShifter.setPitch(-speedDrop * (vocalPitchLift / 100));
    pitchShifterRef.current = pitchShifter;

    // Reverb Node
    const reverb = ctx.createConvolver();
    reverb.buffer = createReverbImpulseResponse(ctx, reverbSize, 2.5);
    reverbNodeRef.current = reverb;

    // Filter nodes
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = highCut;
    filterNodeRef.current = filter;

    const bassBoostNode = ctx.createBiquadFilter();
    bassBoostNode.type = 'lowshelf';
    bassBoostNode.frequency.value = 100;
    bassBoostNode.gain.value = bassBoost;
    bassBoostNodeRef.current = bassBoostNode;

    // Gains
    const dryGain = ctx.createGain();
    const wetGain = ctx.createGain();
    const mix = reverbMix / 100;
    dryGain.gain.value = 1.0 - (mix * 0.3);
    wetGain.gain.value = mix * 0.9;
    dryGainRef.current = dryGain;
    wetGainRef.current = wetGain;

    const masterGain = ctx.createGain();
    masterGain.gain.value = volume / 100;
    masterGainRef.current = masterGain;

    // Analyser Node for visualizer
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 256;
    analyserRef.current = analyser;

    // Connections:
    // Source -> Vocal Pitch Lift -> Bass Boost -> Lowpass Filter
    source.connect(pitchShifter.input);
    pitchShifter.output.connect(bassBoostNode);
    bassBoostNode.connect(filter);

    // Split after lowpass filter into dry & reverb path
    filter.connect(dryGain);
    filter.connect(reverb);
    reverb.connect(wetGain);

    // Combine paths to master gain -> analyser -> destination
    dryGain.connect(masterGain);
    wetGain.connect(masterGain);
    masterGain.connect(analyser);
    analyser.connect(ctx.destination);

    // Speed setting
    source.playbackRate.value = speed / 100;

    // Start
    source.start(0, timeOffset);
    startTimeRef.current = t - (timeOffset / (speed / 100));
    setIsPlaying(true);

    // Start timer & visualizer loop
    updateVisuals();
  };

  const pausePlayback = () => {
    if (!audioCtxRef.current || !sourceNodeRef.current || !isPlaying) return;
    
    const elapsed = audioCtxRef.current.currentTime - startTimeRef.current;
    // Store exact actual offset of file progress
    const fileOffset = elapsed * (speed / 100);
    pausedTimeRef.current = Math.min(fileOffset, duration);

    try { sourceNodeRef.current.stop(); } catch (e) {}
    sourceNodeRef.current.disconnect();
    sourceNodeRef.current = null;
    pitchShifterRef.current?.disconnect();
    pitchShifterRef.current = null;
    setIsPlaying(false);

    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }
  };

  const stopPlayback = () => {
    try { sourceNodeRef.current?.stop(); } catch (e) {}
    sourceNodeRef.current?.disconnect();
    sourceNodeRef.current = null;
    pitchShifterRef.current?.disconnect();
    pitchShifterRef.current = null;
    setIsPlaying(false);
    pausedTimeRef.current = 0;
    setCurrentTime(0);

    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }
  };

  const togglePlay = () => {
    if (isPlaying) {
      pausePlayback();
    } else {
      startPlayback(pausedTimeRef.current);
    }
  };

  // Live timer & visualizer animation frame
  const updateVisuals = () => {
    if (!audioCtxRef.current || !isPlaying) return;

    const elapsed = audioCtxRef.current.currentTime - startTimeRef.current;
    const fileOffset = elapsed * (speed / 100);
    
    if (fileOffset >= duration) {
      stopPlayback();
      return;
    }
    
    setCurrentTime(fileOffset);

    // Visualizer Canvas Drawing
    if (canvasRef.current && analyserRef.current) {
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      const analyser = analyserRef.current;
      
      if (ctx) {
        const width = canvas.width;
        const height = canvas.height;
        const bufferLength = analyser.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);
        
        analyser.getByteFrequencyData(dataArray);
        
        ctx.fillStyle = '#110e0c';
        ctx.fillRect(0, 0, width, height);

        // Draw ambient background glow
        const gradient = ctx.createRadialGradient(width/2, height/2, 10, width/2, height/2, width/1.5);
        gradient.addColorStop(0, 'rgba(217, 119, 6, 0.08)');
        gradient.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, width, height);

        // Draw nice symmetric audio waves
        const barWidth = (width / bufferLength) * 1.5;
        let barHeight;
        let x = 0;

        for (let i = 0; i < bufferLength; i++) {
          barHeight = (dataArray[i] / 255) * (height * 0.7);
          
          // Color scheme: warm sunset transition
          const r = Math.floor(180 + (dataArray[i]/255) * 75);
          const g = Math.floor(100 + (i/bufferLength) * 80);
          const b = Math.floor(20 + (i/bufferLength) * 30);
          ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;

          // Draw double-sided bar
          ctx.fillRect(x, (height - barHeight) / 2, barWidth - 1, barHeight);
          
          x += barWidth + 1;
        }
      }
    }

    animationFrameRef.current = requestAnimationFrame(updateVisuals);
  };

  // Waveform click to seek
  const handleTimelineClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!audioBuffer) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const ratio = clickX / rect.width;
    const seekTime = ratio * duration;

    pausedTimeRef.current = seekTime;
    setCurrentTime(seekTime);

    if (isPlaying) {
      startPlayback(seekTime);
    }
  };

  // Preset quick triggers
  const applyPreset = (preset: 'deep' | 'tokyo' | 'ambient' | 'subwoofer') => {
    if (preset === 'deep') {
      setSpeed(80);
      setReverbMix(55);
      setReverbSize(4.5);
      setHighCut(3200);
      setBassBoost(10);
    } else if (preset === 'tokyo') {
      setSpeed(88);
      setReverbMix(38);
      setReverbSize(3.0);
      setHighCut(5500);
      setBassBoost(4);
    } else if (preset === 'ambient') {
      setSpeed(75);
      setReverbMix(75);
      setReverbSize(6.5);
      setHighCut(2200);
      setBassBoost(8);
    } else if (preset === 'subwoofer') {
      setSpeed(82);
      setReverbMix(40);
      setReverbSize(3.5);
      setHighCut(1800);
      setBassBoost(14);
    }
  };

  // Full Offline Audio Render for High-Quality Export
  const triggerExport = async () => {
    if (!audioBuffer) return;
    setIsExporting(true);
    setExportProgress(0);

    // Stop live playback to focus cpu
    if (isPlaying) {
      pausePlayback();
    }

    try {
      // Slowing down the tempo increases the output duration!
      const stretchFactor = 100 / speed;
      const targetDuration = audioBuffer.duration * stretchFactor;
      const sampleRate = audioBuffer.sampleRate;
      const targetLength = Math.ceil(targetDuration * sampleRate);

      // Create OfflineAudioContext (Stereo output)
      const offlineCtx = new OfflineAudioContext(2, targetLength, sampleRate);

      // Create Nodes in Offline Graph
      const source = offlineCtx.createBufferSource();
      source.buffer = audioBuffer;

      // Vocal pitch lift: matches the live preview's formant/pitch restoration
      const pitchShifter = new TimeDomainPitchShifter(offlineCtx);
      const speedDrop = getSpeedInducedSemitoneDrop(speed);
      pitchShifter.setPitch(-speedDrop * (vocalPitchLift / 100));

      // Reverb Convolver Node
      const reverb = offlineCtx.createConvolver();
      reverb.buffer = createReverbImpulseResponse(offlineCtx, reverbSize, 2.5);

      // EQ Lowpass Filter
      const filter = offlineCtx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = highCut;

      // Bass Lowshelf filter
      const bassBoostNode = offlineCtx.createBiquadFilter();
      bassBoostNode.type = 'lowshelf';
      bassBoostNode.frequency.value = 100;
      bassBoostNode.gain.value = bassBoost;

      // Dry & Wet paths
      const dryGain = offlineCtx.createGain();
      const wetGain = offlineCtx.createGain();
      const mix = reverbMix / 100;
      dryGain.gain.value = 1.0 - (mix * 0.3);
      wetGain.gain.value = mix * 0.9;

      const masterGain = offlineCtx.createGain();
      masterGain.gain.value = volume / 100;

      // Connect Graph
      source.connect(pitchShifter.input);
      pitchShifter.output.connect(bassBoostNode);
      bassBoostNode.connect(filter);
      
      filter.connect(dryGain);
      filter.connect(reverb);
      reverb.connect(wetGain);

      dryGain.connect(masterGain);
      wetGain.connect(masterGain);
      masterGain.connect(offlineCtx.destination);

      // Set slowed playback rate
      source.playbackRate.value = speed / 100;

      // Start rendering
      source.start(0);

      // Simple progress logging
      const progressTimer = setInterval(() => {
        setExportProgress(prev => Math.min(prev + 0.15, 0.95));
      }, 300);

      const renderedBuffer = await offlineCtx.startRendering();
      clearInterval(progressTimer);
      setExportProgress(1.0);

      // Convert rendered buffer to WAV blob
      const wavBlob = bufferToWav(renderedBuffer);
      const downloadUrl = URL.createObjectURL(wavBlob);
      const downloadLink = document.createElement('a');
      const cleanName = audioFile ? audioFile.name.substring(0, audioFile.name.lastIndexOf('.')) : 'track';
      downloadLink.href = downloadUrl;
      downloadLink.download = `${cleanName}_slowed_reverb.wav`;
      document.body.appendChild(downloadLink);
      downloadLink.click();
      document.body.removeChild(downloadLink);
      URL.revokeObjectURL(downloadUrl);

      setIsExporting(false);
    } catch (err) {
      console.error(err);
      alert('Export failed. Please try again.');
      setIsExporting(false);
    }
  };

  // Convert AudioBuffer to WAV format binary helper
  function bufferToWav(abuffer: AudioBuffer) {
    const numOfChan = abuffer.numberOfChannels;
    const length = abuffer.length * numOfChan * 2 + 44;
    const buffer = new ArrayBuffer(length);
    const view = new DataView(buffer);
    const channels = [];
    let i;
    let sample;
    let offset = 0;
    let pos = 0;

    // write WAVE header
    setUint32(0x46464952); // "RIFF"
    setUint32(length - 8); // file length - 8
    setUint32(0x45564157); // "WAVE"

    setUint32(0x20746d66); // "fmt " chunk
    setUint32(16); // chunk length
    setUint16(1); // sample format (raw PCM)
    setUint16(numOfChan);
    setUint32(abuffer.sampleRate);
    setUint32(abuffer.sampleRate * 2 * numOfChan); // byte rate
    setUint16(numOfChan * 2); // block align
    setUint16(16); // bits per sample

    setUint32(0x61746164); // "data" chunk
    setUint32(length - pos - 4); // chunk length

    for (i = 0; i < abuffer.numberOfChannels; i++) {
      channels.push(abuffer.getChannelData(i));
    }

    while (pos < length) {
      for (i = 0; i < numOfChan; i++) {
        // clamp sample to 16-bit PCM range
        sample = Math.max(-1, Math.min(1, channels[i][offset]));
        sample = sample < 0 ? sample * 0x8000 : sample * 0x7FFF;
        view.setInt16(pos, sample, true);
        pos += 2;
      }
      offset++;
    }

    return new Blob([buffer], { type: 'audio/wav' });

    function setUint16(data: number) {
      view.setUint16(pos, data, true);
      pos += 2;
    }

    function setUint32(data: number) {
      view.setUint32(pos, data, true);
      pos += 4;
    }
  }

  // Format Time format helper
  const formatTime = (secs: number) => {
    const mins = Math.floor(secs / 60);
    const remainingSecs = Math.floor(secs % 60);
    return `${mins}:${remainingSecs < 10 ? '0' : ''}${remainingSecs}`;
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start" id="slowed_reverb_root">
      
      {/* LEFT COLUMN - WORKSPACE CANVAS & FILE MANAGEMENT */}
      <section className="lg:col-span-7 space-y-6">
        
        {/* PANEL CARD */}
        <div className="bg-[#1a1714] border border-[#2d2822] rounded-2xl p-6 shadow-xl relative overflow-hidden flex flex-col justify-between">
          
          {/* HEADER ROW */}
          <div className="flex justify-between items-start mb-6">
            <div>
              <h2 className="text-lg font-bold font-sans tracking-tight text-white flex items-center">
                <TrendingDown className="w-5 h-5 mr-2 text-amber-500" />
                SLOWED & REVERB GENERATOR
              </h2>
              <p className="text-xs text-[#a39785] font-mono mt-0.5">Vaporwave, TikTok-Atmosphere & Low-Fi Space Modulator</p>
            </div>
            {audioFile && (
              <button 
                onClick={stopPlayback}
                className="text-xs font-mono text-amber-600 hover:text-amber-400 bg-amber-950/20 px-2.5 py-1 rounded border border-amber-900/30 transition flex items-center gap-1"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Reset Block</span>
              </button>
            )}
          </div>

          {/* DRAG AND DROP ZONE */}
          {!audioFile ? (
            <div className="border-2 border-dashed border-[#3e362e] hover:border-amber-600/40 bg-[#141210]/60 rounded-xl p-10 text-center transition group relative">
              <input 
                type="file" 
                accept="audio/*" 
                onChange={handleFileUpload}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10" 
              />
              <Music className="w-12 h-12 text-[#4d443a] group-hover:text-amber-500 mx-auto mb-4 transition duration-200" />
              <p className="text-sm font-semibold text-white">Drag & drop song here, or click to upload</p>
              <p className="text-xs text-[#8c7f6d] font-mono mt-2">Supports high fidelity WAV, MP3, FLAC, M4A or AAC</p>
            </div>
          ) : (
            <div className="space-y-6">
              
              {/* CURRENT LOADED FILE STATS */}
              <div className="flex items-center justify-between bg-[#141210] p-4 rounded-xl border border-[#26211d]">
                <div className="flex items-center space-x-3 overflow-hidden">
                  <div className="w-10 h-10 rounded-lg bg-amber-950/40 border border-amber-900/40 flex items-center justify-center flex-shrink-0 animate-pulse">
                    <TrendingDown className="w-5 h-5 text-amber-500" />
                  </div>
                  <div className="overflow-hidden">
                    <p className="text-sm font-medium text-white truncate max-w-md">{audioFile.name}</p>
                    <p className="text-xs text-[#8c7f6d] font-mono flex items-center gap-2 mt-0.5">
                      <span>{formatTime(duration)}</span>
                      <span>•</span>
                      <span>{(audioFile.size / (1024 * 1024)).toFixed(2)} MB</span>
                    </p>
                  </div>
                </div>
                <button 
                  onClick={() => {
                    stopPlayback();
                    setAudioFile(null);
                    setAudioBuffer(null);
                  }}
                  className="text-[#8c7f6d] hover:text-rose-500 p-2 rounded-lg transition"
                  title="Remove track"
                >
                  <Trash2 className="w-5 h-5" />
                </button>
              </div>

              {/* REALTIME VISUALIZER CONSOLE */}
              <div className="relative rounded-xl overflow-hidden border border-[#2d2822] bg-[#110e0c] h-32 flex items-center justify-center">
                <canvas 
                  ref={canvasRef} 
                  className="absolute inset-0 w-full h-full"
                  width={600}
                  height={128}
                />
                {!isPlaying && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/30 backdrop-blur-[1px] pointer-events-none z-10">
                    <p className="text-xs font-mono text-[#a39785] tracking-widest flex items-center gap-1.5 uppercase">
                      <Sliders className="w-3.5 h-3.5 text-amber-600 animate-pulse" />
                      Visualizer Standby
                    </p>
                  </div>
                )}
              </div>

              {/* TIMELINE PROGRESS & SPEED STRETCH DISPLAY */}
              <div className="space-y-2">
                <div 
                  className="h-2 w-full bg-[#141210] rounded-full overflow-hidden cursor-pointer relative border border-[#26211d]"
                  onClick={handleTimelineClick}
                >
                  <div 
                    className="h-full bg-gradient-to-r from-amber-600 to-amber-400 rounded-full transition-all duration-100 relative"
                    style={{ width: `${(currentTime / duration) * 100}%` }}
                  >
                    <span className="absolute right-0 top-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-white shadow-md border border-amber-600" />
                  </div>
                </div>
                <div className="flex justify-between items-center text-xs text-[#8c7f6d] font-mono">
                  <span>{formatTime(currentTime)}</span>
                  <span className="text-amber-500 bg-amber-950/20 px-2 py-0.5 rounded border border-amber-900/40">
                    Stretched output: {formatTime(currentTime / (speed/100))} / {formatTime(duration / (speed/100))}
                  </span>
                  <span>{formatTime(duration)}</span>
                </div>
              </div>

              {/* DIRECT ACTIONS PANEL */}
              <div className="flex flex-wrap items-center justify-between gap-4 pt-2">
                <button
                  onClick={togglePlay}
                  className={`px-6 py-3 rounded-xl font-bold flex items-center justify-center space-x-2 transition shadow-md ${
                    isPlaying 
                      ? 'bg-amber-600 hover:bg-amber-500 text-[#141210]' 
                      : 'bg-white hover:bg-amber-100 text-[#141210]'
                  }`}
                >
                  {isPlaying ? (
                    <>
                      <Pause className="w-5 h-5 fill-current" />
                      <span>PAUSE TRACK</span>
                    </>
                  ) : (
                    <>
                      <Play className="w-5 h-5 fill-current" />
                      <span>PLAY SLOWED</span>
                    </>
                  )}
                </button>

                <button
                  onClick={triggerExport}
                  disabled={isExporting}
                  className="px-6 py-3 bg-[#2a231d] hover:bg-[#382f27] border border-[#44382c] disabled:opacity-50 text-white rounded-xl font-bold flex items-center justify-center space-x-2 transition"
                >
                  <Download className={`w-5 h-5 ${isExporting ? 'animate-bounce' : ''}`} />
                  <span>{isExporting ? `EXPORTING ${Math.round(exportProgress * 100)}%` : 'EXPORT HIGH QUALITY WAV'}</span>
                </button>
              </div>

            </div>
          )}
        </div>

        {/* QUICK PRESETS BENTO GRID */}
        {audioFile && (
          <div className="bg-[#1a1714] border border-[#2d2822] rounded-2xl p-6 shadow-xl space-y-4">
            <div>
              <h3 className="text-sm font-semibold tracking-wide text-white uppercase font-mono">Atmosphere Curations</h3>
              <p className="text-xs text-[#a39785] mt-0.5">Instant acoustic environments selected for maximum nostalgic resonance</p>
            </div>
            
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <button 
                onClick={() => applyPreset('deep')}
                className="bg-[#141210] border border-[#2d2822] hover:border-amber-600 p-4 rounded-xl text-left transition"
              >
                <p className="text-xs font-bold text-amber-500 font-mono">01 // DEEP SLOW</p>
                <p className="text-[10px] text-[#8c7f6d] mt-1 leading-snug">0.80x speed, deep wet cathedral room</p>
              </button>

              <button 
                onClick={() => applyPreset('tokyo')}
                className="bg-[#141210] border border-[#2d2822] hover:border-amber-600 p-4 rounded-xl text-left transition"
              >
                <p className="text-xs font-bold text-amber-500 font-mono">02 // TOKYO CABIN</p>
                <p className="text-[10px] text-[#8c7f6d] mt-1 leading-snug">0.88x speed, tight wooden room reverb</p>
              </button>

              <button 
                onClick={() => applyPreset('ambient')}
                className="bg-[#141210] border border-[#2d2822] hover:border-amber-600 p-4 rounded-xl text-left transition"
              >
                <p className="text-xs font-bold text-amber-500 font-mono">03 // STRATOSPHERE</p>
                <p className="text-[10px] text-[#8c7f6d] mt-1 leading-snug">0.75x speed, endless spatial decay</p>
              </button>

              <button 
                onClick={() => applyPreset('subwoofer')}
                className="bg-[#141210] border border-[#2d2822] hover:border-amber-600 p-4 rounded-xl text-left transition"
              >
                <p className="text-xs font-bold text-amber-500 font-mono">04 // CAR MEET 808</p>
                <p className="text-[10px] text-[#8c7f6d] mt-1 leading-snug">0.82x speed, hyper boosted bass rumbles</p>
              </button>
            </div>
          </div>
        )}

      </section>

      {/* RIGHT COLUMN - DSP MODULATION PANEL */}
      <section className="lg:col-span-5 space-y-6">
        
        <div className="bg-[#1a1714] border border-[#2d2822] rounded-2xl p-6 shadow-xl space-y-6">
          <h3 className="text-sm font-semibold tracking-wide text-white uppercase font-mono border-b border-[#2d2822] pb-3 flex items-center">
            <Sliders className="w-4 h-4 mr-2 text-amber-500" />
            TUNING & REVERB CONTROLLER
          </h3>

          {/* PARAMETER SLIDERS */}
          <div className="space-y-5">
            
            {/* SPEED SLIDER */}
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <label className="text-xs font-mono font-bold text-white flex items-center gap-1">
                  <Gauge className="w-3.5 h-3.5 text-amber-500" />
                  PLAYBACK SPEED (TEMPO + PITCH)
                </label>
                <span className="text-xs font-mono text-amber-500 font-bold bg-amber-950/40 border border-amber-900/30 px-2 py-0.5 rounded">
                  {(speed/100).toFixed(2)}x ({(speed - 100)}%)
                </span>
              </div>
              <input 
                type="range"
                min="70"
                max="100"
                value={speed}
                onChange={(e) => setSpeed(Number(e.target.value))}
                className="w-full accent-amber-600 bg-[#141210] h-1.5 rounded-full appearance-none cursor-pointer"
              />
              <div className="flex justify-between text-[10px] text-[#8c7f6d] font-mono">
                <span>0.70x (Extremely Slowed)</span>
                <span>0.85x (Default Ideal)</span>
                <span>1.00x (Original)</span>
              </div>
            </div>

            {/* SINGER'S VOICE SELECTOR + PITCH LIFT */}
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <label className="text-xs font-mono font-bold text-white flex items-center gap-1">
                  <UserRound className="w-3.5 h-3.5 text-amber-500" />
                  SINGER'S VOICE
                </label>
                <span className="text-xs font-mono text-amber-500 font-bold bg-amber-950/40 border border-amber-900/30 px-2 py-0.5 rounded">
                  Pitch lift: {vocalPitchLift}%
                </span>
              </div>

              {detectedVoice && (
                <div className={`text-[10px] font-mono px-2.5 py-1.5 rounded-lg border flex items-center gap-1.5 ${
                  detectedVoice === 'unknown'
                    ? 'bg-[#141210] border-[#3d342b] text-[#a39785]'
                    : 'bg-emerald-950/30 border-emerald-800/40 text-emerald-400'
                }`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${detectedVoice === 'unknown' ? 'bg-[#8c7f6d]' : 'bg-emerald-400 animate-pulse'}`} />
                  {detectedVoice === 'female' && 'AUTO-DETECTED: FEMALE VOICE — tap a button below if this is wrong'}
                  {detectedVoice === 'male' && 'AUTO-DETECTED: MALE VOICE — tap a button below if this is wrong'}
                  {detectedVoice === 'unknown' && "COULDN'T AUTO-DETECT THE VOICE — defaulted to FEMALE, tap to change"}
                </div>
              )}

              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => selectVoiceType('female')}
                  className={`py-2.5 px-2 rounded-lg text-[11px] font-mono font-bold border transition duration-150 ${
                    voiceType === 'female'
                      ? 'bg-pink-600/20 border-pink-500/40 text-pink-300 shadow-sm'
                      : 'bg-[#141210] border-[#26211d] text-[#8c7f6d] hover:border-[#3d342b]'
                  }`}
                >
                  FEMALE VOICE
                  <span className="block text-[9px] font-normal mt-0.5 opacity-80">keeps her real voice</span>
                </button>
                <button
                  onClick={() => selectVoiceType('male')}
                  className={`py-2.5 px-2 rounded-lg text-[11px] font-mono font-bold border transition duration-150 ${
                    voiceType === 'male'
                      ? 'bg-amber-600/20 border-amber-500/40 text-amber-400 shadow-sm'
                      : 'bg-[#141210] border-[#26211d] text-[#8c7f6d] hover:border-[#3d342b]'
                  }`}
                >
                  MALE VOICE
                  <span className="block text-[9px] font-normal mt-0.5 opacity-80">classic deep slowed</span>
                </button>
              </div>

              <input
                type="range"
                min="0"
                max="100"
                value={vocalPitchLift}
                onChange={(e) => {
                  setVocalPitchLift(Number(e.target.value));
                  setVoiceType('custom');
                }}
                className="w-full accent-amber-600 bg-[#141210] h-1.5 rounded-full appearance-none cursor-pointer"
              />
              <div className="flex justify-between text-[10px] text-[#8c7f6d] font-mono">
                <span>0% (Deep Tape Drop)</span>
                <span>100% (Original Voice)</span>
              </div>
              <p className="text-[10px] text-[#746957] leading-normal font-sans">
                Slowing a song drags the voice down with it — a female singer can end up sounding male. The tool listens to your track and picks the right mode automatically; correct it with the buttons if the guess is wrong. FEMALE restores her real voice while the tempo stays slowed; MALE keeps the classic deep drop.
              </p>
            </div>

            {/* REVERB MIX SLIDER */}
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <label className="text-xs font-mono font-bold text-white flex items-center gap-1">
                  <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                  REVERB ATMOSPHERE WET MIX
                </label>
                <span className="text-xs font-mono text-amber-500 font-bold bg-amber-950/40 border border-amber-900/30 px-2 py-0.5 rounded">
                  {reverbMix}%
                </span>
              </div>
              <input 
                type="range"
                min="0"
                max="100"
                value={reverbMix}
                onChange={(e) => setReverbMix(Number(e.target.value))}
                className="w-full accent-amber-600 bg-[#141210] h-1.5 rounded-full appearance-none cursor-pointer"
              />
              <div className="flex justify-between text-[10px] text-[#8c7f6d] font-mono">
                <span>0% (Dry)</span>
                <span>45% (Aesthetic Ideal)</span>
                <span>100% (Fully Immersed)</span>
              </div>
            </div>

            {/* REVERB DECAY/SIZE SLIDER */}
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <label className="text-xs font-mono font-bold text-white flex items-center gap-1">
                  <Activity className="w-3.5 h-3.5 text-amber-500" />
                  REVERB SIZE / COZINESS DECAY
                </label>
                <span className="text-xs font-mono text-amber-500 font-bold bg-amber-950/40 border border-amber-900/30 px-2 py-0.5 rounded">
                  {reverbSize.toFixed(1)} Seconds
                </span>
              </div>
              <input 
                type="range"
                min="1"
                max="7"
                step="0.1"
                value={reverbSize}
                onChange={(e) => setReverbSize(Number(e.target.value))}
                className="w-full accent-amber-600 bg-[#141210] h-1.5 rounded-full appearance-none cursor-pointer"
              />
              <div className="flex justify-between text-[10px] text-[#8c7f6d] font-mono">
                <span>1.0s (Cozy Room)</span>
                <span>3.5s (Classic Lobby)</span>
                <span>7.0s (Vast Cathedral)</span>
              </div>
            </div>

            {/* BASS BOOST */}
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <label className="text-xs font-mono font-bold text-white flex items-center gap-1">
                  <Volume2 className="w-3.5 h-3.5 text-amber-500" />
                  808 & BASS SHELF BOOST
                </label>
                <span className="text-xs font-mono text-amber-500 font-bold bg-amber-950/40 border border-amber-900/30 px-2 py-0.5 rounded">
                  +{bassBoost} dB
                </span>
              </div>
              <input 
                type="range"
                min="0"
                max="15"
                value={bassBoost}
                onChange={(e) => setBassBoost(Number(e.target.value))}
                className="w-full accent-amber-600 bg-[#141210] h-1.5 rounded-full appearance-none cursor-pointer"
              />
              <div className="flex justify-between text-[10px] text-[#8c7f6d] font-mono">
                <span>Flat (0dB)</span>
                <span>6dB (Warm Accent)</span>
                <span>15dB (Deep 808 Rumble)</span>
              </div>
            </div>

            {/* HIGH-END CUT FILTER */}
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <label className="text-xs font-mono font-bold text-white flex items-center gap-1">
                  <Sliders className="w-3.5 h-3.5 text-amber-500" />
                  HIGH END DAMPING (LOW-PASS)
                </label>
                <span className="text-xs font-mono text-amber-500 font-bold bg-amber-950/40 border border-amber-900/30 px-2 py-0.5 rounded">
                  {highCut >= 20000 ? 'Bypassed' : `${highCut} Hz`}
                </span>
              </div>
              <input 
                type="range"
                min="1000"
                max="20000"
                step="100"
                value={highCut}
                onChange={(e) => setHighCut(Number(e.target.value))}
                className="w-full accent-amber-600 bg-[#141210] h-1.5 rounded-full appearance-none cursor-pointer"
              />
              <div className="flex justify-between text-[10px] text-[#8c7f6d] font-mono">
                <span>1,000Hz (Highly Muffled)</span>
                <span>4,500Hz (Smooth Cozy)</span>
                <span>20,000Hz (Clear/Bypassed)</span>
              </div>
            </div>

            {/* MASTER GAIN */}
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <label className="text-xs font-mono font-bold text-white flex items-center gap-1">
                  <Volume2 className="w-3.5 h-3.5 text-amber-500" />
                  CONSOLE GAIN VOLUME
                </label>
                <span className="text-xs font-mono text-amber-500 font-bold bg-amber-950/40 border border-amber-900/30 px-2 py-0.5 rounded">
                  {volume}%
                </span>
              </div>
              <input 
                type="range"
                min="0"
                max="100"
                value={volume}
                onChange={(e) => setVolume(Number(e.target.value))}
                className="w-full accent-amber-600 bg-[#141210] h-1.5 rounded-full appearance-none cursor-pointer"
              />
            </div>

          </div>
        </div>

        {/* HOW TO MAKE SLOWED AND REVERB EXPLANATORY INFO CARD */}
        <div className="bg-[#1e1a16] border border-[#2d2822]/60 rounded-2xl p-5 text-xs leading-relaxed space-y-3 text-[#cfc4b2]">
          <h4 className="text-white font-mono font-bold flex items-center gap-1.5">
            <Sparkles className="w-4 h-4 text-amber-500" />
            HOW "SLOWED & REVERB" WORKS
          </h4>
          <p className="text-xs text-[#a89d89]">
            The slowed and reverb effect replicates the nostalgic atmosphere of listening to slow, echoey cassette tapes in large public spaces or bedrooms. 
          </p>
          <ul className="list-disc pl-4 space-y-1.5 text-[#8c7f6d] font-mono">
            <li><strong className="text-amber-600 font-bold">Speed Scale:</strong> Lowering playback rate matches the authentic speed drop of spinning tape.</li>
            <li><strong className="text-amber-600 font-bold">Resonant Spaces:</strong> Convolvers model acoustic room impulses to surround the vocals.</li>
            <li><strong className="text-amber-600 font-bold">Subwoofer Lift:</strong> Slowed songs depend on extra weight in the bass rumbles.</li>
          </ul>
        </div>

      </section>

    </div>
  );
}
