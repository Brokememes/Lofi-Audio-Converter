import React, { useState, useRef, useEffect } from 'react';
import { 
  Play, 
  Pause, 
  Volume2, 
  Download, 
  Trash2, 
  Sliders, 
  Music,
  Video,
  Sparkles,
  RefreshCw,
  Tv,
  Film,
  Camera,
  Layers,
  CircleDot
} from 'lucide-react';

export default function AudioToVideo() {
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [audioBuffer, setAudioBuffer] = useState<AudioBuffer | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isRendering, setIsRendering] = useState(false);
  const [renderProgress, setRenderProgress] = useState(0);

  // Template customizer state
  const [visualTheme, setVisualTheme] = useState<'sunset' | 'vinyl' | 'matrix' | 'neon_lines'>('sunset');
  const [vocalText, setVocalText] = useState('Lo-Fi Studio Sessions');
  const [pulseIntensity, setPulseIntensity] = useState(70); // 10 to 100
  const [particleDensity, setParticleDensity] = useState(40); // 10 to 100
  const [volume, setVolume] = useState(80);

  // Audio elements
  const audioCtxRef = useRef<AudioContext | null>(null);
  const sourceNodeRef = useRef<AudioBufferSourceNode | null>(null);
  const masterGainRef = useRef<GainNode | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);

  // Canvas details
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const renderLoopRef = useRef<number | null>(null);
  const startTimeRef = useRef<number>(0);
  const pausedTimeRef = useRef<number>(0);

  // Custom particle systems
  const particlesRef = useRef<Array<{ x: number, y: number, speed: number, size: number, angle: number }>>([]);

  useEffect(() => {
    // Populate particles on load
    const particles = [];
    for (let i = 0; i < 150; i++) {
      particles.push({
        x: Math.random() * 800,
        y: Math.random() * 450,
        speed: 0.2 + Math.random() * 0.8,
        size: 1 + Math.random() * 3,
        angle: Math.random() * Math.PI * 2
      });
    }
    particlesRef.current = particles;

    return () => {
      stopPlayback();
      if (audioCtxRef.current) {
        audioCtxRef.current.close();
      }
    };
  }, []);

  // Update master audio node parameters in real-time
  useEffect(() => {
    if (masterGainRef.current && audioCtxRef.current) {
      masterGainRef.current.gain.setTargetAtTime(volume / 100, audioCtxRef.current.currentTime, 0.05);
    }
  }, [volume]);

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
      alert('Error loading audio file. Make sure it is a valid MP3, WAV or FLAC.');
      setIsProcessing(false);
    }
  };

  const startPlayback = (timeOffset = 0) => {
    if (!audioCtxRef.current || !audioBuffer) return;

    if (audioCtxRef.current.state === 'suspended') {
      audioCtxRef.current.resume();
    }

    if (sourceNodeRef.current) {
      try { sourceNodeRef.current.stop(); } catch (e) {}
      sourceNodeRef.current.disconnect();
    }

    const ctx = audioCtxRef.current;
    const t = ctx.currentTime;

    const source = ctx.createBufferSource();
    source.buffer = audioBuffer;
    sourceNodeRef.current = source;

    const masterGain = ctx.createGain();
    masterGain.gain.value = volume / 100;
    masterGainRef.current = masterGain;

    const analyser = ctx.createAnalyser();
    analyser.fftSize = 512;
    analyserRef.current = analyser;

    // Connect source -> master gain -> analyser -> speakers
    source.connect(masterGain);
    masterGain.connect(analyser);
    analyser.connect(ctx.destination);

    source.start(0, timeOffset);
    startTimeRef.current = t - timeOffset;
    setIsPlaying(true);

    // Start video animation render loop
    runRenderLoop();
  };

  const pausePlayback = () => {
    if (!audioCtxRef.current || !sourceNodeRef.current || !isPlaying) return;

    const elapsed = audioCtxRef.current.currentTime - startTimeRef.current;
    pausedTimeRef.current = Math.min(elapsed, duration);

    try { sourceNodeRef.current.stop(); } catch (e) {}
    sourceNodeRef.current.disconnect();
    sourceNodeRef.current = null;
    setIsPlaying(false);

    if (renderLoopRef.current) {
      cancelAnimationFrame(renderLoopRef.current);
    }
  };

  const stopPlayback = () => {
    try { sourceNodeRef.current?.stop(); } catch (e) {}
    sourceNodeRef.current?.disconnect();
    sourceNodeRef.current = null;
    setIsPlaying(false);
    pausedTimeRef.current = 0;
    setCurrentTime(0);

    if (renderLoopRef.current) {
      cancelAnimationFrame(renderLoopRef.current);
    }
  };

  const togglePlay = () => {
    if (isPlaying) {
      pausePlayback();
    } else {
      startPlayback(pausedTimeRef.current);
    }
  };

  // Canvas drawing loop (handles standard playback & captures stream in render mode)
  const runRenderLoop = () => {
    if (!audioCtxRef.current || !isPlaying) return;

    const elapsed = audioCtxRef.current.currentTime - startTimeRef.current;
    if (elapsed >= duration) {
      stopPlayback();
      return;
    }
    setCurrentTime(elapsed);

    drawCanvasFrame();
    renderLoopRef.current = requestAnimationFrame(runRenderLoop);
  };

  // Core visual theme painter function
  const drawCanvasFrame = () => {
    if (!canvasRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const analyser = analyserRef.current;

    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;
    
    // Read audio frequency information
    const bufferLength = analyser ? analyser.frequencyBinCount : 256;
    const dataArray = new Uint8Array(bufferLength);
    if (analyser) {
      analyser.getByteFrequencyData(dataArray);
    }

    // Calculate energy levels
    const lowFreqSum = dataArray.slice(0, 15).reduce((a, b) => a + b, 0);
    const midFreqSum = dataArray.slice(15, 80).reduce((a, b) => a + b, 0);
    const bassScale = 1.0 + (lowFreqSum / (15 * 255)) * (pulseIntensity / 100) * 0.4;
    const midScale = 1.0 + (midFreqSum / (65 * 255)) * 0.2;

    // Clear Canvas and Draw Background according to Visual Theme
    if (visualTheme === 'sunset') {
      // 1. Synthwave/Retro Sunset visual theme
      // Sky Gradient
      const skyGrad = ctx.createLinearGradient(0, 0, 0, height);
      skyGrad.addColorStop(0, '#0a0015');
      skyGrad.addColorStop(0.5, '#2e003e');
      skyGrad.addColorStop(1, '#ff0055');
      ctx.fillStyle = skyGrad;
      ctx.fillRect(0, 0, width, height);

      // Draw horizontal background glow lines
      ctx.strokeStyle = 'rgba(255, 0, 255, 0.15)';
      ctx.lineWidth = 1;
      for (let y = height / 2; y < height; y += 8) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
      }

      // Draw Retro sun in middle
      const sunRadius = 65 * bassScale;
      const sunGrad = ctx.createLinearGradient(width/2, height/2 - sunRadius, width/2, height/2 + sunRadius);
      sunGrad.addColorStop(0, '#f97316');
      sunGrad.addColorStop(1, '#ec4899');
      ctx.fillStyle = sunGrad;
      ctx.beginPath();
      ctx.arc(width/2, height/2 + 20, sunRadius, Math.PI, 0); // half circle sun
      ctx.fill();

      // Draw sun horizon grids cuts
      ctx.fillStyle = '#0a0015';
      for (let y = height/2 + 25; y < height/2 + 20 + sunRadius; y += 6) {
        const heightSlice = 2 + (y - (height/2 + 20)) * 0.1;
        ctx.fillRect(width/2 - sunRadius - 10, y, sunRadius * 2 + 20, heightSlice);
      }

      // Draw floor grid perspective lines
      ctx.strokeStyle = '#ec4899';
      ctx.lineWidth = 1.5;
      const horizonY = height / 2 + 20;
      for (let x = -200; x <= width + 200; x += 60) {
        ctx.beginPath();
        ctx.moveTo(width / 2, horizonY);
        ctx.lineTo(x, height);
        ctx.stroke();
      }

      // Draw horizontal moving grids (horizontal scanner)
      ctx.strokeStyle = '#f43f5e';
      ctx.lineWidth = 1;
      const speedOffset = (Date.now() / 25) % 30;
      for (let y = horizonY; y < height; y += 15) {
        const adjustedY = y + speedOffset;
        if (adjustedY < height) {
          ctx.beginPath();
          ctx.moveTo(0, adjustedY);
          ctx.lineTo(width, adjustedY);
          ctx.stroke();
        }
      }

      // Draw concentric audio bar visualizer on horizon
      ctx.fillStyle = 'rgba(253, 224, 71, 0.8)';
      const barWidth = 3;
      const totalBars = 60;
      const spacing = 4;
      const startX = width / 2 - (totalBars * (barWidth + spacing)) / 2;

      for (let i = 0; i < totalBars; i++) {
        const dataIdx = Math.floor((i / totalBars) * (bufferLength / 2));
        const val = dataArray[dataIdx] || 0;
        const barHeight = (val / 255) * 60;
        const xPos = startX + i * (barWidth + spacing);
        
        // Symmetrical center-out visual
        ctx.fillRect(xPos, horizonY - barHeight, barWidth, barHeight);
      }

    } else if (visualTheme === 'vinyl') {
      // 2. Spinning Retro Vinyl Visual theme
      ctx.fillStyle = '#0b0a09';
      ctx.fillRect(0, 0, width, height);

      // Soft circular neon radial glow
      const bgGlow = ctx.createRadialGradient(width/2, height/2, 2, width/2, height/2, 220);
      bgGlow.addColorStop(0, 'rgba(217, 119, 6, 0.15)');
      bgGlow.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = bgGlow;
      ctx.fillRect(0, 0, width, height);

      // Rotating angle
      const rotationSpeed = (Date.now() / 1500) % (Math.PI * 2);

      // Draw outer vinyl disc grooves
      const vinylCenterX = width / 2;
      const vinylCenterY = height / 2;
      const vinylBaseRadius = 110 * midScale;

      ctx.strokeStyle = '#1e1a16';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(vinylCenterX, vinylCenterY, vinylBaseRadius, 0, Math.PI * 2);
      ctx.stroke();

      ctx.strokeStyle = '#2d2822';
      ctx.lineWidth = 1;
      for (let r = 40; r < vinylBaseRadius; r += 6) {
        ctx.beginPath();
        ctx.arc(vinylCenterX, vinylCenterY, r, 0, Math.PI * 2);
        ctx.stroke();
      }

      // Draw glossy reflections
      const reflectGrad = ctx.createLinearGradient(width/2 - 100, height/2 - 100, width/2 + 100, height/2 + 100);
      reflectGrad.addColorStop(0, 'rgba(255,255,255,0.05)');
      reflectGrad.addColorStop(0.5, 'rgba(0,0,0,0)');
      reflectGrad.addColorStop(1, 'rgba(255,255,255,0.05)');
      ctx.fillStyle = reflectGrad;
      ctx.beginPath();
      ctx.arc(vinylCenterX, vinylCenterY, vinylBaseRadius, 0, Math.PI * 2);
      ctx.fill();

      // Spinning center sticker label
      ctx.save();
      ctx.translate(vinylCenterX, vinylCenterY);
      ctx.rotate(rotationSpeed);
      
      // Sticker center
      ctx.fillStyle = '#b45309';
      ctx.beginPath();
      ctx.arc(0, 0, 35, 0, Math.PI * 2);
      ctx.fill();

      // Vintage circle design on sticker
      ctx.strokeStyle = '#eae5db';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(0, 0, 28, 0, Math.PI * 2);
      ctx.stroke();

      // Crosshairs on sticker
      ctx.beginPath();
      ctx.moveTo(-28, 0);
      ctx.lineTo(28, 0);
      ctx.moveTo(0, -28);
      ctx.lineTo(0, 28);
      ctx.stroke();

      ctx.restore();

      // Spindle center metal pin
      ctx.fillStyle = '#f59e0b';
      ctx.beginPath();
      ctx.arc(vinylCenterX, vinylCenterY, 6, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(vinylCenterX - 1, vinylCenterY - 1, 2, 0, Math.PI * 2);
      ctx.fill();

      // Draw concentric audio visualizer ring wrapping around the vinyl
      ctx.strokeStyle = '#f59e0b';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      const ringBars = 120;
      for (let i = 0; i < ringBars; i++) {
        const angle = (i / ringBars) * Math.PI * 2 + rotationSpeed;
        const dataIdx = Math.floor((i / ringBars) * (bufferLength / 1.5));
        const val = dataArray[dataIdx] || 0;
        const radialHeight = (val / 255) * 35;
        
        const outerRadius = vinylBaseRadius + 5 + radialHeight;
        const x1 = vinylCenterX + Math.cos(angle) * (vinylBaseRadius + 5);
        const y1 = vinylCenterY + Math.sin(angle) * (vinylBaseRadius + 5);
        const x2 = vinylCenterX + Math.cos(angle) * outerRadius;
        const y2 = vinylCenterY + Math.sin(angle) * outerRadius;
        
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
      }
      ctx.stroke();

    } else if (visualTheme === 'matrix') {
      // 3. Cyber Matrix Digital Code theme
      ctx.fillStyle = 'rgba(0, 5, 0, 0.9)';
      ctx.fillRect(0, 0, width, height);

      // Draw scrolling digital particles
      ctx.fillStyle = 'rgba(34, 197, 94, 0.25)';
      const count = Math.floor(particleDensity);
      for (let i = 0; i < count; i++) {
        const p = particlesRef.current[i];
        p.y += p.speed * 2 * bassScale;
        if (p.y > height) {
          p.y = 0;
          p.x = Math.random() * width;
        }
        
        // Draw binary values
        ctx.font = `${p.size + 8}px monospace`;
        ctx.fillText(Math.random() > 0.5 ? '1' : '0', p.x, p.y);
      }

      // Center digital oscilloscope circular rings
      ctx.strokeStyle = '#22c55e';
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (let i = 0; i < bufferLength; i += 2) {
        const angle = (i / bufferLength) * Math.PI * 2;
        const val = dataArray[i] || 0;
        const r = 80 + (val / 255) * 50;
        const x = width / 2 + Math.cos(angle) * r;
        const y = height / 2 + Math.sin(angle) * r;
        
        if (i === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      }
      ctx.closePath();
      ctx.stroke();

    } else if (visualTheme === 'neon_lines') {
      // 4. Floating neon lines & audio spectrum waves
      ctx.fillStyle = '#020617';
      ctx.fillRect(0, 0, width, height);

      // Side ambient neon gradients
      const leftGrad = ctx.createRadialGradient(0, height/2, 5, 0, height/2, 200);
      leftGrad.addColorStop(0, 'rgba(99, 102, 241, 0.2)');
      leftGrad.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = leftGrad;
      ctx.fillRect(0, 0, width, height);

      const rightGrad = ctx.createRadialGradient(width, height/2, 5, width, height/2, 200);
      rightGrad.addColorStop(0, 'rgba(236, 72, 153, 0.2)');
      rightGrad.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = rightGrad;
      ctx.fillRect(0, 0, width, height);

      // Draw floating smooth bezier spectrum waves across the middle
      ctx.strokeStyle = 'rgba(99, 102, 241, 0.8)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      const segmentWidth = width / 16;
      ctx.moveTo(0, height / 2);
      for (let i = 0; i <= 16; i++) {
        const dataIdx = Math.floor((i / 16) * (bufferLength / 2));
        const val = dataArray[dataIdx] || 0;
        const offsetHeight = (val / 255) * 110;
        const x = i * segmentWidth;
        const y = height / 2 + (i % 2 === 0 ? -offsetHeight : offsetHeight);
        
        if (i === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      }
      ctx.stroke();

      // Mirror wave
      ctx.strokeStyle = 'rgba(236, 72, 153, 0.6)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, height / 2);
      for (let i = 0; i <= 16; i++) {
        const dataIdx = Math.floor((i / 16) * (bufferLength / 2));
        const val = dataArray[dataIdx] || 0;
        const offsetHeight = (val / 255) * 80;
        const x = i * segmentWidth;
        const y = height / 2 + (i % 2 === 0 ? offsetHeight : -offsetHeight);
        
        if (i === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      }
      ctx.stroke();
    }

    // Overlay floating decorative ambient particles on top
    if (visualTheme !== 'matrix') {
      ctx.fillStyle = visualTheme === 'sunset' ? 'rgba(251, 113, 133, 0.4)' : 'rgba(255, 255, 255, 0.25)';
      const count = Math.floor(particleDensity);
      for (let i = 0; i < count; i++) {
        const p = particlesRef.current[i];
        p.y -= p.speed * 0.7 * bassScale;
        p.x += Math.sin(p.angle + Date.now() / 1000) * 0.2;
        if (p.y < 0) {
          p.y = height;
          p.x = Math.random() * width;
        }
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * (bassScale * 0.8), 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // DRAW HUD TITLE CARD & PROGRESS TEXT OVERLAY (Highly aesthetic!)
    ctx.fillStyle = 'rgba(15, 12, 10, 0.75)';
    ctx.fillRect(20, 20, width - 40, 48);
    ctx.strokeStyle = 'rgba(140, 127, 109, 0.2)';
    ctx.lineWidth = 1;
    ctx.strokeRect(20, 20, width - 40, 48);

    // Decorative target crosshairs in corner
    ctx.fillStyle = '#f59e0b';
    ctx.fillRect(24, 24, 4, 1.5);
    ctx.fillRect(24, 24, 1.5, 4);
    ctx.fillRect(width - 28, 24, 4, 1.5);
    ctx.fillRect(width - 25, 24, 1.5, 4);

    // Custom Label Text
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 12px "Inter", sans-serif';
    ctx.fillText(vocalText.toUpperCase(), 40, 41);

    ctx.fillStyle = '#8c7f6d';
    ctx.font = '9px monospace';
    ctx.fillText(`VISUAL LEVEL: ${(bassScale * 100).toFixed(0)}%`, 40, 54);

    // Dynamic flashing red "REC" light indicator representing capture state
    if (isRendering) {
      ctx.fillStyle = '#ef4444';
      ctx.beginPath();
      ctx.arc(width - 55, 43, 4.5, 0, Math.PI * 2);
      ctx.fill();
      
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 9px monospace';
      ctx.fillText('RENDERING', width - 118, 46);
    } else {
      ctx.fillStyle = '#22c55e';
      ctx.beginPath();
      ctx.arc(width - 55, 43, 4.5, 0, Math.PI * 2);
      ctx.fill();
      
      ctx.fillStyle = '#8c7f6d';
      ctx.font = '9px monospace';
      ctx.fillText('STANDBY', width - 105, 46);
    }
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

  // Renders the Canvas frames combined with audio stream directly into an MP4/WebM video file!
  // This uses pure browser MediaRecorder and is an incredibly premium, high-value feature.
  const triggerVideoRender = async () => {
    if (!audioBuffer) return;
    setIsRendering(true);
    setRenderProgress(0);

    // Stop active preview
    if (isPlaying) {
      pausePlayback();
    }

    try {
      const renderCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const source = renderCtx.createBufferSource();
      source.buffer = audioBuffer;

      const analyser = renderCtx.createAnalyser();
      analyser.fftSize = 512;

      // Create a MediaStreamAudioDestinationNode to record high quality clean audio!
      const audioDest = renderCtx.createMediaStreamDestination();
      
      // Connect: Source -> destination (and speakers, but we can keep speakers muted or audible)
      source.connect(analyser);
      analyser.connect(audioDest);
      analyser.connect(renderCtx.destination); // let the user hear it during rendering

      // Start canvas drawings loop synced to new context
      analyserRef.current = analyser;
      audioCtxRef.current = renderCtx;
      setIsPlaying(true);
      startTimeRef.current = renderCtx.currentTime;

      source.start(0);

      // Record visualizer stream
      if (!canvasRef.current) throw new Error("Canvas element missing");
      const canvasStream = canvasRef.current.captureStream(30); // 30 FPS video stream capture!

      // Combine Canvas video track and Audio destination track
      const combinedStream = new MediaStream();
      canvasStream.getVideoTracks().forEach(track => combinedStream.addTrack(track));
      audioDest.stream.getAudioTracks().forEach(track => combinedStream.addTrack(track));

      // MediaRecorder setup (using standard webm container which is widely supported for client encoding)
      let options = { mimeType: 'video/webm;codecs=vp9,opus' };
      if (!MediaRecorder.isTypeSupported(options.mimeType)) {
        options = { mimeType: 'video/webm' };
      }

      const mediaRecorder = new MediaRecorder(combinedStream, options);
      const chunks: BlobPart[] = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunks.push(e.data);
        }
      };

      mediaRecorder.onstop = () => {
        const videoBlob = new Blob(chunks, { type: 'video/webm' });
        const videoUrl = URL.createObjectURL(videoBlob);
        
        // Trigger file download
        const downloadLink = document.createElement('a');
        const cleanName = audioFile ? audioFile.name.substring(0, audioFile.name.lastIndexOf('.')) : 'track';
        downloadLink.href = videoUrl;
        downloadLink.download = `${cleanName}_lofi_visualizer.webm`;
        document.body.appendChild(downloadLink);
        downloadLink.click();
        document.body.removeChild(downloadLink);
        URL.revokeObjectURL(videoUrl);

        setIsRendering(false);
        setRenderProgress(1.0);
        stopPlayback();
      };

      // Record the duration of the audio
      mediaRecorder.start();

      // Render progress indicator timer
      const renderStartTime = Date.now();
      const progressTimer = setInterval(() => {
        const elapsedSecs = (Date.now() - renderStartTime) / 1000;
        const progress = Math.min(elapsedSecs / duration, 0.99);
        setRenderProgress(progress);

        if (elapsedSecs >= duration) {
          clearInterval(progressTimer);
          mediaRecorder.stop();
          source.stop();
        }
      }, 500);

    } catch (err) {
      console.error("Video rendering failed:", err);
      alert('Video render failed. Make sure your browser supports MediaRecorder Canvas capture.');
      setIsRendering(false);
    }
  };

  const formatTime = (secs: number) => {
    const mins = Math.floor(secs / 60);
    const remainingSecs = Math.floor(secs % 60);
    return `${mins}:${remainingSecs < 10 ? '0' : ''}${remainingSecs}`;
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start" id="audio_to_video_root">
      
      {/* LEFT COLUMN - CANVAS PREVIEW STUDIO */}
      <section className="lg:col-span-7 space-y-6">
        
        {/* PANEL CARD */}
        <div className="bg-[#1a1714] border border-[#2d2822] rounded-2xl p-6 shadow-xl relative overflow-hidden flex flex-col justify-between">
          
          <div className="flex justify-between items-start mb-6">
            <div>
              <h2 className="text-lg font-bold font-sans tracking-tight text-white flex items-center">
                <Video className="w-5 h-5 mr-2 text-amber-500" />
                AUDIO-TO-VIDEO EXPORTER
              </h2>
              <p className="text-xs text-[#a39785] font-mono mt-0.5">Render customized High Definition reactive visualizers for social media exports</p>
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
              <p className="text-xs text-[#8c7f6d] font-mono mt-2">Upload lofi beats or standard audio files</p>
            </div>
          ) : (
            <div className="space-y-6">
              
              {/* CURRENT LOADED FILE */}
              <div className="flex items-center justify-between bg-[#141210] p-4 rounded-xl border border-[#26211d]">
                <div className="flex items-center space-x-3 overflow-hidden">
                  <div className="w-10 h-10 rounded-lg bg-amber-950/40 border border-amber-900/40 flex items-center justify-center flex-shrink-0">
                    <Video className="w-5 h-5 text-amber-500" />
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

              {/* RENDER CANVAS STAGE (16:9 aspect ratio standard video output) */}
              <div className="relative rounded-xl overflow-hidden border border-[#2d2822] bg-[#110e0c] aspect-video w-full flex items-center justify-center shadow-inner">
                <canvas 
                  ref={canvasRef} 
                  className="absolute inset-0 w-full h-full object-contain"
                  width={800}
                  height={450}
                />
                {!isPlaying && !isRendering && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/60 backdrop-blur-[1px] pointer-events-none z-10">
                    <p className="text-xs font-mono text-[#a39785] tracking-widest flex items-center gap-1.5 uppercase">
                      <Tv className="w-3.5 h-3.5 text-amber-600 animate-pulse" />
                      Visualizer Canvas Standby
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
                    className="h-full bg-gradient-to-r from-amber-600 to-amber-400 rounded-full transition-all duration-100"
                    style={{ width: `${(currentTime / duration) * 100}%` }}
                  />
                </div>
                <div className="flex justify-between items-center text-xs text-[#8c7f6d] font-mono">
                  <span>{formatTime(currentTime)}</span>
                  <span className="text-amber-500 bg-amber-950/20 px-2.5 py-0.5 rounded border border-amber-900/40">
                    16:9 Standard HD Format (WebM Output)
                  </span>
                  <span>{formatTime(duration)}</span>
                </div>
              </div>

              {/* ACTIONS */}
              <div className="flex flex-wrap items-center justify-between gap-4 pt-2">
                <button
                  onClick={togglePlay}
                  disabled={isRendering}
                  className={`px-6 py-3 rounded-xl font-bold flex items-center justify-center space-x-2 transition shadow-md disabled:opacity-50 ${
                    isPlaying 
                      ? 'bg-amber-600 hover:bg-amber-500 text-[#141210]' 
                      : 'bg-white hover:bg-amber-100 text-[#141210]'
                  }`}
                >
                  {isPlaying ? (
                    <>
                      <Pause className="w-5 h-5 fill-current" />
                      <span>PAUSE STUDIO</span>
                    </>
                  ) : (
                    <>
                      <Play className="w-5 h-5 fill-current" />
                      <span>PREVIEW DRAFT</span>
                    </>
                  )}
                </button>

                <button
                  onClick={triggerVideoRender}
                  disabled={isRendering}
                  className="px-6 py-3 bg-[#e11d48] hover:bg-[#be123c] border border-[#f43f5e] disabled:bg-[#3f1621] disabled:border-[#9f1239] disabled:opacity-80 text-white rounded-xl font-bold flex items-center justify-center space-x-2 transition shadow-lg"
                >
                  <Camera className={`w-5 h-5 ${isRendering ? 'animate-spin' : ''}`} />
                  <span>{isRendering ? `RECORDING VIDEO: ${Math.round(renderProgress * 100)}%` : 'RENDER VIDEO FILE'}</span>
                </button>
              </div>

            </div>
          )}
        </div>
      </section>

      {/* RIGHT COLUMN - VISUAL THEME MODULATION */}
      <section className="lg:col-span-5 space-y-6">
        
        <div className="bg-[#1a1714] border border-[#2d2822] rounded-2xl p-6 shadow-xl space-y-6">
          <h3 className="text-sm font-semibold tracking-wide text-white uppercase font-mono border-b border-[#2d2822] pb-3 flex items-center">
            <Sliders className="w-4 h-4 mr-2 text-amber-500" />
            VISUAL LAYER CUSTOMIZER
          </h3>

          <div className="space-y-5">
            
            {/* VISUAL THEMES SELECT */}
            <div className="space-y-2">
              <label className="text-xs font-mono font-bold text-white block">CHOOSE TEMPLATE THEME</label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => { setVisualTheme('sunset'); if (isPlaying) drawCanvasFrame(); }}
                  className={`py-2 px-3 rounded-xl text-xs font-mono font-bold border transition text-left flex items-center gap-1.5 ${
                    visualTheme === 'sunset' 
                      ? 'bg-amber-600 text-black border-amber-500' 
                      : 'bg-[#141210] border-[#2d2822] text-[#8c7f6d] hover:text-white'
                  }`}
                >
                  <Film className="w-3.5 h-3.5" />
                  RETROWAVE SUNSET
                </button>
                <button
                  onClick={() => { setVisualTheme('vinyl'); if (isPlaying) drawCanvasFrame(); }}
                  className={`py-2 px-3 rounded-xl text-xs font-mono font-bold border transition text-left flex items-center gap-1.5 ${
                    visualTheme === 'vinyl' 
                      ? 'bg-amber-600 text-black border-amber-500' 
                      : 'bg-[#141210] border-[#2d2822] text-[#8c7f6d] hover:text-white'
                  }`}
                >
                  <CircleDot className="w-3.5 h-3.5" />
                  RESONANT VINYL
                </button>
                <button
                  onClick={() => { setVisualTheme('matrix'); if (isPlaying) drawCanvasFrame(); }}
                  className={`py-2 px-3 rounded-xl text-xs font-mono font-bold border transition text-left flex items-center gap-1.5 ${
                    visualTheme === 'matrix' 
                      ? 'bg-amber-600 text-black border-amber-500' 
                      : 'bg-[#141210] border-[#2d2822] text-[#8c7f6d] hover:text-white'
                  }`}
                >
                  <Tv className="w-3.5 h-3.5" />
                  DIGITAL MATRIX
                </button>
                <button
                  onClick={() => { setVisualTheme('neon_lines'); if (isPlaying) drawCanvasFrame(); }}
                  className={`py-2 px-3 rounded-xl text-xs font-mono font-bold border transition text-left flex items-center gap-1.5 ${
                    visualTheme === 'neon_lines' 
                      ? 'bg-amber-600 text-black border-amber-500' 
                      : 'bg-[#141210] border-[#2d2822] text-[#8c7f6d] hover:text-white'
                  }`}
                >
                  <Layers className="w-3.5 h-3.5" />
                  NEON BEZIER WAVE
                </button>
              </div>
            </div>

            {/* OVERLAY CUSTOM TEXT */}
            <div className="space-y-2">
              <label className="text-xs font-mono font-bold text-white block">OVERLAY TITLE CARD TEXT</label>
              <input 
                type="text"
                maxLength={40}
                value={vocalText}
                onChange={(e) => { setVocalText(e.target.value); if (isPlaying) drawCanvasFrame(); }}
                className="w-full bg-[#141210] border border-[#2d2822] text-white px-3 py-2 rounded-xl text-xs font-mono focus:outline-none focus:border-amber-500 transition"
                placeholder="Enter title text for video label..."
              />
            </div>

            {/* INTENSITY SLIDER */}
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <label className="text-xs font-mono font-bold text-white flex items-center gap-1">
                  <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                  AUDIO PULSE SENSITIVITY
                </label>
                <span className="text-xs font-mono text-amber-500 font-bold bg-amber-950/40 border border-amber-900/30 px-2 py-0.5 rounded">
                  {pulseIntensity}%
                </span>
              </div>
              <input 
                type="range"
                min="10"
                max="100"
                value={pulseIntensity}
                onChange={(e) => setPulseIntensity(Number(e.target.value))}
                className="w-full accent-amber-600 bg-[#141210] h-1.5 rounded-full appearance-none cursor-pointer"
              />
            </div>

            {/* DENSITY SLIDER */}
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <label className="text-xs font-mono font-bold text-white flex items-center gap-1">
                  <Layers className="w-3.5 h-3.5 text-amber-500" />
                  FLOATING PARTICLES DENSITY
                </label>
                <span className="text-xs font-mono text-amber-500 font-bold bg-amber-950/40 border border-amber-900/30 px-2 py-0.5 rounded">
                  {particleDensity}
                </span>
              </div>
              <input 
                type="range"
                min="10"
                max="150"
                value={particleDensity}
                onChange={(e) => setParticleDensity(Number(e.target.value))}
                className="w-full accent-amber-600 bg-[#141210] h-1.5 rounded-full appearance-none cursor-pointer"
              />
            </div>

            {/* PREVIEW VOLUME */}
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <label className="text-xs font-mono font-bold text-white flex items-center gap-1">
                  <Volume2 className="w-3.5 h-3.5 text-amber-500" />
                  PREVIEW VOLUME
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

        {/* PRO-TIP BANNER */}
        <div className="bg-[#1e1a16] border border-[#2d2822]/60 rounded-2xl p-5 text-xs leading-relaxed space-y-2 text-[#cfc4b2]">
          <h4 className="text-white font-mono font-bold flex items-center gap-1.5">
            <Sparkles className="w-4 h-4 text-amber-500" />
            RENDERING QUALITY ADVISORY
          </h4>
          <p className="text-xs text-[#a89d89]">
            The rendering engine captures video fully in real-time. Keep the browser tab focused and active while rendering to ensure a smooth, stable 30 FPS video record cycle. 
          </p>
          <p className="text-[#8c7f6d] font-mono text-[11px] leading-tight mt-1">
            Output is coded in high efficiency WebM container formats, which are fully optimized for direct uploads to Youtube, TikTok, Instagram or further local conversion.
          </p>
        </div>

      </section>

    </div>
  );
}
