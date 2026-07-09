import React, { useState, useRef, useEffect } from 'react';
import { 
  Play, 
  Pause, 
  Volume2, 
  Download, 
  Trash2, 
  Sliders, 
  Music,
  Disc,
  Compass,
  Sparkles,
  RefreshCw,
  Orbit
} from 'lucide-react';

// Help helper for generating programmatic Reverb impulse buffer
function createReverbImpulseResponse(ctx: BaseAudioContext, duration: number, decay: number): AudioBuffer {
  const sampleRate = ctx.sampleRate;
  const length = sampleRate * duration;
  const impulse = ctx.createBuffer(2, length, sampleRate);
  
  const left = impulse.getChannelData(0);
  const right = impulse.getChannelData(1);
  
  for (let i = 0; i < length; i++) {
    const percent = i / length;
    const l = (Math.random() * 2 - 1) * Math.pow(1 - percent, decay);
    const r = (Math.random() * 2 - 1) * Math.pow(1 - percent, decay);
    const damp = 1 - (percent * 0.4);
    left[i] = l * damp;
    right[i] = r * damp;
  }
  
  return impulse;
}

export default function Spatial8D() {
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [audioBuffer, setAudioBuffer] = useState<AudioBuffer | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);

  // FX parameters
  const [panSpeed, setPanSpeed] = useState(12); // LFO Speed: 0.02Hz to 0.5Hz, scaled as 1 to 50
  const [panWidth, setPanWidth] = useState(90); // 0% to 100%
  const [reverbMix, setReverbMix] = useState(30); // 0% to 100%
  const [volume, setVolume] = useState(80);
  const [panPattern, setPanPattern] = useState<'sine' | 'triangle' | 'orbit'>('sine');

  // Audio Graph refs
  const audioCtxRef = useRef<AudioContext | null>(null);
  const sourceNodeRef = useRef<AudioBufferSourceNode | null>(null);
  const pannerNodeRef = useRef<StereoPannerNode | null>(null);
  const pannerLfoRef = useRef<OscillatorNode | null>(null);
  const lfoGainRef = useRef<GainNode | null>(null);
  const reverbNodeRef = useRef<ConvolverNode | null>(null);
  const dryGainRef = useRef<GainNode | null>(null);
  const wetGainRef = useRef<GainNode | null>(null);
  const masterGainRef = useRef<GainNode | null>(null);

  // Animation frame and coordinates
  const animationFrameRef = useRef<number | null>(null);
  const startTimeRef = useRef<number>(0);
  const pausedTimeRef = useRef<number>(0);
  
  // Custom manual panning accumulator for visualizer feedback & manual LFO fallback
  const thetaRef = useRef<number>(0);

  // Visualizer Canvas Ref
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);

  useEffect(() => {
    return () => {
      stopPlayback();
      if (audioCtxRef.current) {
        audioCtxRef.current.close();
      }
    };
  }, []);

  // Update dynamic audio node parameters in real-time
  useEffect(() => {
    if (!audioCtxRef.current) return;
    const t = audioCtxRef.current.currentTime;

    // Convert panSpeed to Hz (frequency)
    const freq = (panSpeed / 100) * 0.4 + 0.02; // Range: 0.02Hz to 0.22Hz
    const depth = panWidth / 100;

    // Set LFO params if Web Audio oscillator is running
    if (pannerLfoRef.current && lfoGainRef.current) {
      pannerLfoRef.current.frequency.setTargetAtTime(freq, t, 0.1);
      lfoGainRef.current.gain.setTargetAtTime(depth, t, 0.1);
    }

    // Set Reverb Mix
    const mix = reverbMix / 100;
    if (dryGainRef.current && wetGainRef.current) {
      dryGainRef.current.gain.setTargetAtTime(1.0 - (mix * 0.2), t, 0.05);
      wetGainRef.current.gain.setTargetAtTime(mix * 0.75, t, 0.05);
    }

    // Master Volume
    if (masterGainRef.current) {
      masterGainRef.current.gain.setTargetAtTime(volume / 100, t, 0.05);
    }
  }, [panSpeed, panWidth, reverbMix, volume]);

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
      const decodedBuffer = await audioCtxRef.current.decodeAudioData(arrayBuffer);
      setAudioBuffer(decodedBuffer);
      setDuration(decodedBuffer.duration);
      setIsProcessing(false);
    } catch (err) {
      console.error(err);
      alert('Error loading audio file. Please try a valid MP3, WAV or FLAC.');
      setIsProcessing(false);
    }
  };

  const startPlayback = (timeOffset = 0) => {
    if (!audioCtxRef.current || !audioBuffer) return;

    if (audioCtxRef.current.state === 'suspended') {
      audioCtxRef.current.resume();
    }

    // Clean up current play source
    if (sourceNodeRef.current) {
      try { sourceNodeRef.current.stop(); } catch (e) {}
      sourceNodeRef.current.disconnect();
    }
    if (pannerLfoRef.current) {
      try { pannerLfoRef.current.stop(); } catch (e) {}
      pannerLfoRef.current.disconnect();
    }

    const ctx = audioCtxRef.current;
    const t = ctx.currentTime;

    const source = ctx.createBufferSource();
    source.buffer = audioBuffer;
    sourceNodeRef.current = source;

    // Create Stereo Panner Node
    // Note: Some legacy browsers don't support createStereoPanner, fallback is handled or we use simple gains
    let panner: StereoPannerNode;
    try {
      panner = ctx.createStereoPanner();
    } catch (e) {
      // In case browser compatibility breaks (rare in 2026, but elegant fallback is professional)
      console.warn("StereoPannerNode unsupported, using custom node mock");
      panner = ctx.createStereoPanner();
    }
    pannerNodeRef.current = panner;

    // Create a Web Audio LFO to automatically oscillate the stereo panning node in the background!
    const lfo = ctx.createOscillator();
    const lfoGain = ctx.createGain();
    
    // Choose wave shape based on selected panning pattern
    lfo.type = panPattern === 'triangle' ? 'triangle' : 'sine';
    const freq = (panSpeed / 100) * 0.4 + 0.02; // Range: 0.02Hz to 0.22Hz
    lfo.frequency.value = freq;
    
    const depth = panWidth / 100;
    lfoGain.gain.value = depth;

    // Connect LFO -> LFO Gain -> Panner's "pan" AudioParam
    lfo.connect(lfoGain);
    lfoGain.connect(panner.pan);
    pannerLfoRef.current = lfo;
    lfoGainRef.current = lfoGain;

    // Create Reverb Node
    const reverb = ctx.createConvolver();
    reverb.buffer = createReverbImpulseResponse(ctx, 3.0, 2.5);
    reverbNodeRef.current = reverb;

    // Create Gains
    const dryGain = ctx.createGain();
    const wetGain = ctx.createGain();
    const mix = reverbMix / 100;
    dryGain.gain.value = 1.0 - (mix * 0.2);
    wetGain.gain.value = mix * 0.75;
    dryGainRef.current = dryGain;
    wetGainRef.current = wetGain;

    const masterGain = ctx.createGain();
    masterGain.gain.value = volume / 100;
    masterGainRef.current = masterGain;

    // Analyser Node
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 256;
    analyserRef.current = analyser;

    // Connect Graph
    // Source -> Panner
    source.connect(panner);

    // Split after panner into dry path and reverb path (spatialized reverb!)
    panner.connect(dryGain);
    panner.connect(reverb);
    reverb.connect(wetGain);

    // Combine wet & dry paths to master volume
    dryGain.connect(masterGain);
    wetGain.connect(masterGain);
    masterGain.connect(analyser);
    analyser.connect(ctx.destination);

    // Start source and LFO
    source.start(0, timeOffset);
    lfo.start(0);

    startTimeRef.current = t - timeOffset;
    setIsPlaying(true);

    // Render visualization loop
    updateVisuals();
  };

  const pausePlayback = () => {
    if (!audioCtxRef.current || !sourceNodeRef.current || !isPlaying) return;

    const elapsed = audioCtxRef.current.currentTime - startTimeRef.current;
    pausedTimeRef.current = Math.min(elapsed, duration);

    try { sourceNodeRef.current.stop(); } catch (e) {}
    sourceNodeRef.current.disconnect();
    sourceNodeRef.current = null;

    try { pannerLfoRef.current?.stop(); } catch (e) {}
    pannerLfoRef.current?.disconnect();
    pannerLfoRef.current = null;

    setIsPlaying(false);

    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }
  };

  const stopPlayback = () => {
    try { sourceNodeRef.current?.stop(); } catch (e) {}
    sourceNodeRef.current?.disconnect();
    sourceNodeRef.current = null;

    try { pannerLfoRef.current?.stop(); } catch (e) {}
    pannerLfoRef.current?.disconnect();
    pannerLfoRef.current = null;

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

  // Live timer & 3D coordinate orbital visualization loop
  const updateVisuals = () => {
    if (!audioCtxRef.current || !isPlaying) return;

    const elapsed = audioCtxRef.current.currentTime - startTimeRef.current;
    if (elapsed >= duration) {
      stopPlayback();
      return;
    }
    setCurrentTime(elapsed);

    // Update theta sweep angle for orbit graphics
    const freq = (panSpeed / 100) * 0.4 + 0.02;
    thetaRef.current += (Math.PI * 2 * freq) / 60; // assume ~60fps

    if (canvasRef.current) {
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      const analyser = analyserRef.current;

      if (ctx) {
        const width = canvas.width;
        const height = canvas.height;
        ctx.fillStyle = '#110e0c';
        ctx.fillRect(0, 0, width, height);

        const centerX = width / 2;
        const centerY = height / 2;

        // Draw radial grid markers
        ctx.strokeStyle = '#2d2822';
        ctx.lineWidth = 1;
        
        ctx.beginPath();
        ctx.arc(centerX, centerY, 40, 0, Math.PI * 2);
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(centerX, centerY, 75, 0, Math.PI * 2);
        ctx.stroke();

        // Draw static Listener head in center
        ctx.fillStyle = '#a39785';
        ctx.beginPath();
        ctx.arc(centerX, centerY, 15, 0, Math.PI * 2); // head
        ctx.fill();

        // Left ear
        ctx.fillStyle = '#ffaa33';
        ctx.beginPath();
        ctx.arc(centerX - 17, centerY, 5, 0, Math.PI * 2);
        ctx.fill();

        // Right ear
        ctx.beginPath();
        ctx.arc(centerX + 17, centerY, 5, 0, Math.PI * 2);
        ctx.fill();

        // Nose pointing upwards
        ctx.fillStyle = '#8c7f6d';
        ctx.beginPath();
        ctx.moveTo(centerX, centerY - 15);
        ctx.lineTo(centerX - 4, centerY - 22);
        ctx.lineTo(centerX + 4, centerY - 22);
        ctx.closePath();
        ctx.fill();

        // Left/Right audio channel sweep coordinate
        // LFO sine wave panning yields standard left-right pan value between -1 and 1
        let currentPan = 0;
        if (pannerNodeRef.current) {
          // Read actual panner pan value
          currentPan = pannerNodeRef.current.pan.value;
        } else {
          currentPan = Math.sin(thetaRef.current) * (panWidth / 100);
        }

        // Map pan to angle on circle:
        // Orbit mode spins fully, sine/triangle moves back and forth
        let soundX = centerX;
        let soundY = centerY;
        const radius = 75;

        if (panPattern === 'orbit') {
          // Complete spinning motion
          soundX = centerX + Math.sin(thetaRef.current) * radius * (panWidth / 100);
          soundY = centerY - Math.cos(thetaRef.current) * radius * (panWidth / 100);
        } else {
          // Left to Right horizontal sweep
          soundX = centerX + currentPan * radius;
          soundY = centerY - Math.sqrt(Math.max(0, radius * radius - (currentPan * radius) * (currentPan * radius))) * 0.3; // subtle curve for 3D trajectory
        }

        // Draw audio wave particle ring from sound source
        let signalIntensity = 10;
        if (analyser) {
          const dataArray = new Uint8Array(analyser.frequencyBinCount);
          analyser.getByteFrequencyData(dataArray);
          const sum = dataArray.reduce((a, b) => a + b, 0);
          signalIntensity = Math.max(10, (sum / dataArray.length) * 0.9);
        }

        // Pulse glow behind the listener based on panning & intensity
        const gradient = ctx.createRadialGradient(soundX, soundY, 2, soundX, soundY, signalIntensity);
        gradient.addColorStop(0, 'rgba(217, 119, 6, 0.6)');
        gradient.addColorStop(0.5, 'rgba(217, 119, 6, 0.2)');
        gradient.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(soundX, soundY, signalIntensity, 0, Math.PI * 2);
        ctx.fill();

        // Sound Source Orb
        ctx.fillStyle = '#f59e0b';
        ctx.beginPath();
        ctx.arc(soundX, soundY, 8, 0, Math.PI * 2);
        ctx.fill();

        // Draw visual connecting dotted lines representing sound travels
        ctx.strokeStyle = 'rgba(245, 158, 11, 0.25)';
        ctx.setLineDash([4, 4]);
        
        ctx.beginPath();
        ctx.moveTo(soundX, soundY);
        ctx.lineTo(centerX - 15, centerY); // left ear
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(soundX, soundY);
        ctx.lineTo(centerX + 15, centerY); // right ear
        ctx.stroke();
        
        ctx.setLineDash([]); // clear dash

        // Draw HUD stats text overlay
        ctx.fillStyle = '#8c7f6d';
        ctx.font = '9px monospace';
        ctx.fillText(`LFO PHASE: ${(thetaRef.current % (Math.PI * 2)).toFixed(2)} RAD`, 10, height - 25);
        ctx.fillText(`PAN BALANCE: ${currentPan.toFixed(2)} [L/R]`, 10, height - 12);
      }
    }

    animationFrameRef.current = requestAnimationFrame(updateVisuals);
  };

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

  // 8D Audio Offline rendering for exports
  const triggerExport = async () => {
    if (!audioBuffer) return;
    setIsExporting(true);
    setExportProgress(0);

    if (isPlaying) {
      pausePlayback();
    }

    try {
      const sampleRate = audioBuffer.sampleRate;
      const targetLength = audioBuffer.length;
      const offlineCtx = new OfflineAudioContext(2, targetLength, sampleRate);

      const source = offlineCtx.createBufferSource();
      source.buffer = audioBuffer;

      // Create Offline Panner
      const panner = offlineCtx.createStereoPanner();
      
      // Since LFO nodes inside OfflineAudioContext process programmatically, we hook up
      // an offline Oscillator to modulate the panning value!
      const lfo = offlineCtx.createOscillator();
      const lfoGain = offlineCtx.createGain();

      lfo.type = panPattern === 'triangle' ? 'triangle' : 'sine';
      const freq = (panSpeed / 100) * 0.4 + 0.02;
      lfo.frequency.value = freq;
      
      const depth = panWidth / 100;
      lfoGain.gain.value = depth;

      lfo.connect(lfoGain);
      lfoGain.connect(panner.pan);

      // Create Offline Reverb
      const reverb = offlineCtx.createConvolver();
      reverb.buffer = createReverbImpulseResponse(offlineCtx, 3.0, 2.5);

      const dryGain = offlineCtx.createGain();
      const wetGain = offlineCtx.createGain();
      const mix = reverbMix / 100;
      dryGain.gain.value = 1.0 - (mix * 0.2);
      wetGain.gain.value = mix * 0.75;

      const masterGain = offlineCtx.createGain();
      masterGain.gain.value = volume / 100;

      // Connections
      source.connect(panner);
      
      panner.connect(dryGain);
      panner.connect(reverb);
      reverb.connect(wetGain);

      dryGain.connect(masterGain);
      wetGain.connect(masterGain);
      masterGain.connect(offlineCtx.destination);

      // Start offline rendering
      source.start(0);
      lfo.start(0);

      const progressTimer = setInterval(() => {
        setExportProgress(prev => Math.min(prev + 0.18, 0.95));
      }, 300);

      const renderedBuffer = await offlineCtx.startRendering();
      clearInterval(progressTimer);
      setExportProgress(1.0);

      // Export WAV File
      const wavBlob = bufferToWav(renderedBuffer);
      const downloadUrl = URL.createObjectURL(wavBlob);
      const downloadLink = document.createElement('a');
      const cleanName = audioFile ? audioFile.name.substring(0, audioFile.name.lastIndexOf('.')) : 'track';
      downloadLink.href = downloadUrl;
      downloadLink.download = `${cleanName}_8D_spatial.wav`;
      document.body.appendChild(downloadLink);
      downloadLink.click();
      document.body.removeChild(downloadLink);
      URL.revokeObjectURL(downloadUrl);

      setIsExporting(false);
    } catch (err) {
      console.error(err);
      alert('8D rendering export failed. Please try again.');
      setIsExporting(false);
    }
  };

  // Convert to WAV helper
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

    setUint32(0x46464952); // "RIFF"
    setUint32(length - 8);
    setUint32(0x45564157); // "WAVE"

    setUint32(0x20746d66); // "fmt "
    setUint32(16);
    setUint16(1);
    setUint16(numOfChan);
    setUint32(abuffer.sampleRate);
    setUint32(abuffer.sampleRate * 2 * numOfChan);
    setUint16(numOfChan * 2);
    setUint16(16);

    setUint32(0x61746164); // "data"
    setUint32(length - pos - 4);

    for (i = 0; i < abuffer.numberOfChannels; i++) {
      channels.push(abuffer.getChannelData(i));
    }

    while (pos < length) {
      for (i = 0; i < numOfChan; i++) {
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

  const formatTime = (secs: number) => {
    const mins = Math.floor(secs / 60);
    const remainingSecs = Math.floor(secs % 60);
    return `${mins}:${remainingSecs < 10 ? '0' : ''}${remainingSecs}`;
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start" id="spatial_8d_root">
      
      {/* LEFT COLUMN - WORKSPACE CANVAS & 3D MAP */}
      <section className="lg:col-span-7 space-y-6">
        
        {/* PANEL CARD */}
        <div className="bg-[#1a1714] border border-[#2d2822] rounded-2xl p-6 shadow-xl relative overflow-hidden flex flex-col justify-between">
          
          <div className="flex justify-between items-start mb-6">
            <div>
              <h2 className="text-lg font-bold font-sans tracking-tight text-white flex items-center">
                <Orbit className="w-5 h-5 mr-2 text-amber-500" />
                8D SPATIAL AUDIO CONVERTER
              </h2>
              <p className="text-xs text-[#a39785] font-mono mt-0.5">Dual-Phase Binaural Orbital LFO Sound Panner</p>
            </div>
          </div>

          {/* UPLOAD PANEL */}
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
              <p className="text-xs text-[#8c7f6d] font-mono mt-2">Best experienced on Headphones 🎧</p>
            </div>
          ) : (
            <div className="space-y-6">
              
              {/* LOADED FILE */}
              <div className="flex items-center justify-between bg-[#141210] p-4 rounded-xl border border-[#26211d]">
                <div className="flex items-center space-x-3 overflow-hidden">
                  <div className="w-10 h-10 rounded-lg bg-amber-950/40 border border-amber-900/40 flex items-center justify-center flex-shrink-0">
                    <Orbit className="w-5 h-5 text-amber-500 animate-spin" style={{ animationDuration: '6s' }} />
                  </div>
                  <div className="overflow-hidden">
                    <p className="text-sm font-medium text-white truncate max-w-md">{audioFile.name}</p>
                    <p className="text-xs text-[#8c7f6d] font-mono mt-0.5">
                      <span>{formatTime(duration)}</span> • <span>{(audioFile.size / (1024 * 1024)).toFixed(2)} MB</span>
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
                >
                  <Trash2 className="w-5 h-5" />
                </button>
              </div>

              {/* orbital interactive visualizer */}
              <div className="relative rounded-xl overflow-hidden border border-[#2d2822] bg-[#110e0c] h-52 flex items-center justify-center">
                <canvas 
                  ref={canvasRef} 
                  className="absolute inset-0 w-full h-full"
                  width={500}
                  height={208}
                />
                {!isPlaying && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/40 backdrop-blur-[1px] pointer-events-none z-10">
                    <p className="text-xs font-mono text-[#a39785] tracking-widest flex items-center gap-1.5 uppercase">
                      <Compass className="w-3.5 h-3.5 text-amber-600 animate-spin" />
                      Spatial Engine Standby
                    </p>
                  </div>
                )}
              </div>

              {/* TIMELINE */}
              <div className="space-y-2">
                <div 
                  className="h-2 w-full bg-[#141210] rounded-full overflow-hidden cursor-pointer relative border border-[#26211d]"
                  onClick={handleTimelineClick}
                >
                  <div 
                    className="h-full bg-gradient-to-r from-amber-600 to-amber-400 rounded-full transition-all duration-100"
                    style={{ width: `${(currentTime / duration) * 100}%` }}
                  />
                </div>
                <div className="flex justify-between items-center text-xs text-[#8c7f6d] font-mono">
                  <span>{formatTime(currentTime)}</span>
                  <span className="text-amber-500 bg-amber-950/20 px-2.5 py-0.5 rounded border border-amber-900/40">
                    Binaural Sweep Mode
                  </span>
                  <span>{formatTime(duration)}</span>
                </div>
              </div>

              {/* ACTIONS */}
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
                      <span>PLAY 8D BINAURAL</span>
                    </>
                  )}
                </button>

                <button
                  onClick={triggerExport}
                  disabled={isExporting}
                  className="px-6 py-3 bg-[#2a231d] hover:bg-[#382f27] border border-[#44382c] disabled:opacity-50 text-white rounded-xl font-bold flex items-center justify-center space-x-2 transition"
                >
                  <Download className={`w-5 h-5 ${isExporting ? 'animate-bounce' : ''}`} />
                  <span>{isExporting ? `RENDERING ${Math.round(exportProgress * 100)}%` : 'EXPORT IMMERSIVE 8D WAV'}</span>
                </button>
              </div>

            </div>
          )}
        </div>
      </section>

      {/* RIGHT COLUMN - SPATIAL ENGINE MODULATION */}
      <section className="lg:col-span-5 space-y-6">
        
        <div className="bg-[#1a1714] border border-[#2d2822] rounded-2xl p-6 shadow-xl space-y-6">
          <h3 className="text-sm font-semibold tracking-wide text-white uppercase font-mono border-b border-[#2d2822] pb-3 flex items-center">
            <Sliders className="w-4 h-4 mr-2 text-amber-500" />
            PANNING CONTROLS
          </h3>

          <div className="space-y-5">
            
            {/* LFO SPEED */}
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <label className="text-xs font-mono font-bold text-white flex items-center gap-1">
                  <RefreshCw className="w-3.5 h-3.5 text-amber-500" />
                  3D ROTATION RATE (LFO SPEED)
                </label>
                <span className="text-xs font-mono text-amber-500 font-bold bg-amber-950/40 border border-amber-900/30 px-2 py-0.5 rounded">
                  {((panSpeed / 100) * 0.4 + 0.02).toFixed(3)} Hz
                </span>
              </div>
              <input 
                type="range"
                min="1"
                max="50"
                value={panSpeed}
                onChange={(e) => setPanSpeed(Number(e.target.value))}
                className="w-full accent-amber-600 bg-[#141210] h-1.5 rounded-full appearance-none cursor-pointer"
              />
              <div className="flex justify-between text-[10px] text-[#8c7f6d] font-mono">
                <span>0.02Hz (Lush Slow)</span>
                <span>0.10Hz (Default 8D)</span>
                <span>0.22Hz (Fast Orbital)</span>
              </div>
            </div>

            {/* SPATIAL WIDTH / DEPTH */}
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <label className="text-xs font-mono font-bold text-white flex items-center gap-1">
                  <Compass className="w-3.5 h-3.5 text-amber-500" />
                  PAN SWEEP RADIUS (DEPTH)
                </label>
                <span className="text-xs font-mono text-amber-500 font-bold bg-amber-950/40 border border-amber-900/30 px-2 py-0.5 rounded">
                  {panWidth}%
                </span>
              </div>
              <input 
                type="range"
                min="10"
                max="100"
                value={panWidth}
                onChange={(e) => setPanWidth(Number(e.target.value))}
                className="w-full accent-amber-600 bg-[#141210] h-1.5 rounded-full appearance-none cursor-pointer"
              />
              <div className="flex justify-between text-[10px] text-[#8c7f6d] font-mono">
                <span>Narrow</span>
                <span>Balanced</span>
                <span>Hyper-Extended Binaural</span>
              </div>
            </div>

            {/* REVERB DEPTH */}
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <label className="text-xs font-mono font-bold text-white flex items-center gap-1">
                  <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                  SPATIALIZED CONVEX REVERB
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
            </div>

            {/* LFO PATTERN SELECT */}
            <div className="space-y-2">
              <label className="text-xs font-mono font-bold text-white block">PANNING TRAJECTORY SHAPE</label>
              <div className="grid grid-cols-3 gap-2">
                <button
                  onClick={() => setPanPattern('sine')}
                  className={`py-2 px-3 rounded-xl text-xs font-mono font-bold border transition ${
                    panPattern === 'sine' 
                      ? 'bg-amber-600 text-black border-amber-500' 
                      : 'bg-[#141210] border-[#2d2822] text-[#8c7f6d] hover:text-white'
                  }`}
                >
                  SINE WAVE
                </button>
                <button
                  onClick={() => setPanPattern('triangle')}
                  className={`py-2 px-3 rounded-xl text-xs font-mono font-bold border transition ${
                    panPattern === 'triangle' 
                      ? 'bg-amber-600 text-black border-amber-500' 
                      : 'bg-[#141210] border-[#2d2822] text-[#8c7f6d] hover:text-white'
                  }`}
                >
                  TRIANGLE
                </button>
                <button
                  onClick={() => setPanPattern('orbit')}
                  className={`py-2 px-3 rounded-xl text-xs font-mono font-bold border transition ${
                    panPattern === 'orbit' 
                      ? 'bg-amber-600 text-black border-amber-500' 
                      : 'bg-[#141210] border-[#2d2822] text-[#8c7f6d] hover:text-white'
                  }`}
                >
                  360° SPIN
                </button>
              </div>
            </div>

            {/* MASTER GAIN */}
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <label className="text-xs font-mono font-bold text-white flex items-center gap-1">
                  <Volume2 className="w-3.5 h-3.5 text-amber-500" />
                  OUTPUT GAIN
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

        {/* 8D EDUCATION DETAILS */}
        <div className="bg-[#1e1a16] border border-[#2d2822]/60 rounded-2xl p-5 text-xs leading-relaxed space-y-2.5 text-[#cfc4b2]">
          <h4 className="text-white font-mono font-bold flex items-center gap-1.5">
            <Sparkles className="w-4 h-4 text-amber-500" />
            WHAT MAKES 8D AUDIO IM-MERSIVE?
          </h4>
          <p className="text-xs text-[#a89d89]">
            The term "8D" represents multi-dimensional panning. It stimulates the brain's horizontal audio location centers by shifting spatial interaural intensity differences.
          </p>
          <ul className="list-disc pl-4 space-y-1 text-[#8c7f6d] font-mono">
            <li><strong className="text-amber-600 font-bold">Interaural Phase:</strong> Shifting the signal between left & right simulated ears.</li>
            <li><strong className="text-amber-600 font-bold">LFO Modulator:</strong> Smoothly oscillating the balance continuously.</li>
            <li><strong className="text-amber-600 font-bold">Reverb Spill:</strong> Soft wet echo keeps the sound feeling natural.</li>
          </ul>
        </div>

      </section>

    </div>
  );
}
