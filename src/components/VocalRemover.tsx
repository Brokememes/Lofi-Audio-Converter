import React, { useState, useRef, useEffect } from 'react';
import { 
  Play, 
  Pause, 
  Volume2, 
  Download, 
  Trash2, 
  Sliders, 
  Music, 
  MicOff,
  Activity
} from 'lucide-react';

export default function VocalRemover() {
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [audioBuffer, setAudioBuffer] = useState<AudioBuffer | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [vocalCutDepth, setVocalCutDepth] = useState(100); // 0 to 100
  const [lowPreserveFreq, setLowPreserveFreq] = useState(150); // Hz
  const [volume, setVolume] = useState(80);

  const audioCtxRef = useRef<AudioContext | null>(null);
  const sourceNodeRef = useRef<AudioBufferSourceNode | null>(null);
  const splitterNodeRef = useRef<ChannelSplitterNode | null>(null);
  const mergerNodeRef = useRef<ChannelMergerNode | null>(null);
  const leftGainRef = useRef<GainNode | null>(null);
  const rightGainRef = useRef<GainNode | null>(null);
  const monoGainRef = useRef<GainNode | null>(null);
  const dryGainRef = useRef<GainNode | null>(null);
  const lowPassRef = useRef<BiquadFilterNode | null>(null);
  const masterGainRef = useRef<GainNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const startTimeRef = useRef<number>(0);
  const pausedTimeRef = useRef<number>(0);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      stopPlayback();
      if (audioCtxRef.current) {
        audioCtxRef.current.close();
      }
    };
  }, []);

  // Set up Audio Graph node parameters in real-time
  useEffect(() => {
    if (!audioCtxRef.current) return;
    const t = audioCtxRef.current.currentTime;

    // Adjust Vocal Removal Balance
    const depth = vocalCutDepth / 100;
    if (leftGainRef.current && rightGainRef.current && dryGainRef.current && monoGainRef.current) {
      // In center channel cancellation:
      // Left_out = Left_dry + (Left_dry - Right_dry) * depth
      // But we can do this more simply:
      // To get Vocal-Removed (Karaoke):
      // Left = original_L
      // Right = original_R
      // By combining: Mono = L - R, we cancel center.
      // So wet path is: Mono (L - R)
      // Dry path is: Original Stereo (L, R)
      // We crossfade between pure dry (depth = 0) and pure wet mono (depth = 1)
      leftGainRef.current.gain.setTargetAtTime(1.0, t, 0.05);
      rightGainRef.current.gain.setTargetAtTime(-depth, t, 0.05); // inverted R combined into mono
      monoGainRef.current.gain.setTargetAtTime(depth, t, 0.05);
      dryGainRef.current.gain.setTargetAtTime(1 - depth, t, 0.05);
    }

    if (lowPassRef.current) {
      lowPassRef.current.frequency.setTargetAtTime(lowPreserveFreq, t, 0.05);
    }

    if (masterGainRef.current) {
      masterGainRef.current.gain.setTargetAtTime(volume / 100, t, 0.05);
    }
  }, [vocalCutDepth, lowPreserveFreq, volume]);

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
      setCurrentTime(0);
      pausedTimeRef.current = 0;
    } catch (err) {
      console.error('Error decoding audio data:', err);
      alert('Failed to decode audio file. Make sure it is a valid MP3, WAV, or AAC file.');
    } finally {
      setIsProcessing(false);
    }
  };

  const startPlayback = () => {
    if (!audioBuffer || !audioCtxRef.current) return;

    if (audioCtxRef.current.state === 'suspended') {
      audioCtxRef.current.resume();
    }

    // Stop existing nodes
    if (sourceNodeRef.current) {
      try {
        sourceNodeRef.current.stop();
      } catch (e) {}
    }

    const ctx = audioCtxRef.current;
    const source = ctx.createBufferSource();
    source.buffer = audioBuffer;
    sourceNodeRef.current = source;

    // Create the Vocal Remover Audio Graph
    // 1. Channel Splitter
    const splitter = ctx.createChannelSplitter(2);
    // 2. Channel Merger
    const merger = ctx.createChannelMerger(2);

    // 3. Wet Path: Left - Right (center cancellation)
    const leftGain = ctx.createGain();
    const rightGain = ctx.createGain();
    const wetMonoGain = ctx.createGain();

    leftGainRef.current = leftGain;
    rightGainRef.current = rightGain;
    monoGainRef.current = wetMonoGain;

    // 4. Low-Bass Preservation Path (Keep sub-bass in stereo/original format)
    const lowPass = ctx.createBiquadFilter();
    lowPass.type = 'lowpass';
    lowPass.frequency.value = lowPreserveFreq;
    lowPassRef.current = lowPass;

    // 5. Dry Path (Original Stereo)
    const dryGain = ctx.createGain();
    dryGainRef.current = dryGain;

    // Connect Source to paths
    source.connect(splitter);
    source.connect(lowPass); // bass preservation
    source.connect(dryGain); // dry path

    // Configure Wet cancellation path: L - R
    // Left output of source goes to left gain
    splitter.connect(leftGain, 0);
    // Right output of source goes to right gain
    splitter.connect(rightGain, 1);

    // Sum both into wetMonoGain
    leftGain.connect(wetMonoGain);
    rightGain.connect(wetMonoGain); // Right gain has negative value (-depth), performing subtraction!

    // Connect paths to Master Destination Merger
    // Wet Mono goes to both Left and Right of Master merger
    wetMonoGain.connect(merger, 0, 0);
    wetMonoGain.connect(merger, 0, 1);

    // Dry original goes to merger
    dryGain.connect(merger, 0, 0);
    dryGain.connect(merger, 0, 1);

    // Low Bass bypass goes to merger
    lowPass.connect(merger, 0, 0);
    lowPass.connect(merger, 0, 1);

    // Master volume control
    const masterGain = ctx.createGain();
    masterGain.gain.value = volume / 100;
    masterGainRef.current = masterGain;

    merger.connect(masterGain);
    masterGain.connect(ctx.destination);

    // Set interactive initial parameters
    const t = ctx.currentTime;
    const depth = vocalCutDepth / 100;
    leftGain.gain.setValueAtTime(1.0, t);
    rightGain.gain.setValueAtTime(-depth, t);
    wetMonoGain.gain.setValueAtTime(depth, t);
    dryGain.gain.setValueAtTime(1 - depth, t);

    // Start playback
    const offset = pausedTimeRef.current;
    source.start(0, offset);
    startTimeRef.current = ctx.currentTime - offset;
    setIsPlaying(true);

    // Animation tracking
    updateProgress();
  };

  const pausePlayback = () => {
    if (!isPlaying) return;
    if (sourceNodeRef.current && audioCtxRef.current) {
      try {
        sourceNodeRef.current.stop();
      } catch (e) {}
      pausedTimeRef.current = audioCtxRef.current.currentTime - startTimeRef.current;
    }
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }
    setIsPlaying(false);
  };

  const stopPlayback = () => {
    if (sourceNodeRef.current) {
      try {
        sourceNodeRef.current.stop();
      } catch (e) {}
    }
    pausedTimeRef.current = 0;
    setCurrentTime(0);
    setIsPlaying(false);
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }
  };

  const updateProgress = () => {
    if (!audioCtxRef.current || !isPlaying) return;
    const curr = audioCtxRef.current.currentTime - startTimeRef.current;
    if (curr >= duration) {
      stopPlayback();
    } else {
      setCurrentTime(curr);
      animationFrameRef.current = requestAnimationFrame(updateProgress);
    }
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    pausedTimeRef.current = val;
    setCurrentTime(val);
    if (isPlaying) {
      startPlayback();
    }
  };

  // Offline rendering of the processed instrumental track
  const exportInstrumental = async () => {
    if (!audioBuffer || !audioFile) return;
    setIsExporting(true);

    try {
      const sampleRate = audioBuffer.sampleRate;
      const offlineCtx = new OfflineAudioContext(2, sampleRate * audioBuffer.duration, sampleRate);

      // Create Nodes in Offline Context
      const offlineSource = offlineCtx.createBufferSource();
      offlineSource.buffer = audioBuffer;

      const splitter = offlineCtx.createChannelSplitter(2);
      const merger = offlineCtx.createChannelMerger(2);

      const leftGain = offlineCtx.createGain();
      const rightGain = offlineCtx.createGain();
      const wetMonoGain = offlineCtx.createGain();

      const lowPass = offlineCtx.createBiquadFilter();
      lowPass.type = 'lowpass';
      lowPass.frequency.value = lowPreserveFreq;

      const dryGain = offlineCtx.createGain();

      // Configure gains exactly like real-time
      const depth = vocalCutDepth / 100;
      leftGain.gain.setValueAtTime(1.0, 0);
      rightGain.gain.setValueAtTime(-depth, 0);
      wetMonoGain.gain.setValueAtTime(depth, 0);
      dryGain.gain.setValueAtTime(1 - depth, 0);

      // Connect Offline graph
      offlineSource.connect(splitter);
      offlineSource.connect(lowPass);
      offlineSource.connect(dryGain);

      splitter.connect(leftGain, 0);
      splitter.connect(rightGain, 1);

      leftGain.connect(wetMonoGain);
      rightGain.connect(wetMonoGain);

      wetMonoGain.connect(merger, 0, 0);
      wetMonoGain.connect(merger, 0, 1);

      dryGain.connect(merger, 0, 0);
      dryGain.connect(merger, 0, 1);

      lowPass.connect(merger, 0, 0);
      lowPass.connect(merger, 0, 1);

      merger.connect(offlineCtx.destination);

      offlineSource.start(0);

      // Render audio
      const renderedBuffer = await offlineCtx.startRendering();

      // Convert to WAV
      const wavBlob = bufferToWavBlob(renderedBuffer);
      const downloadUrl = URL.createObjectURL(wavBlob);
      const downloadLink = document.createElement('a');
      const cleanName = audioFile.name.substring(0, audioFile.name.lastIndexOf('.')) || audioFile.name;
      downloadLink.href = downloadUrl;
      downloadLink.download = `${cleanName}_instrumental_karaoke.wav`;
      document.body.appendChild(downloadLink);
      downloadLink.click();
      document.body.removeChild(downloadLink);
      URL.revokeObjectURL(downloadUrl);
    } catch (err) {
      console.error(err);
      alert('Failed to export instrumental track. Please try again.');
    } finally {
      setIsExporting(false);
    }
  };

  // Convert AudioBuffer to WAV Blob
  const bufferToWavBlob = (buffer: AudioBuffer): Blob => {
    const numOfChan = buffer.numberOfChannels;
    const length = buffer.length * numOfChan * 2 + 44;
    const bufferArr = new ArrayBuffer(length);
    const view = new DataView(bufferArr);
    const channels = [];
    let offset = 0;
    let pos = 0;

    // Write WAV header
    const setUint32 = (data: number) => {
      view.setUint32(pos, data, true);
      pos += 4;
    };

    const setUint16 = (data: number) => {
      view.setUint16(pos, data, true);
      pos += 2;
    };

    setUint32(0x46464952); // "RIFF"
    setUint32(length - 8); // file length - 8
    setUint32(0x45564157); // "WAVE"
    setUint32(0x20746d66); // "fmt " chunk
    setUint32(16); // chunk length
    setUint16(1); // sample format (PCM)
    setUint16(numOfChan);
    setUint32(buffer.sampleRate);
    setUint32(buffer.sampleRate * 2 * numOfChan); // byte rate
    setUint16(numOfChan * 2); // block align
    setUint16(16); // bits per sample
    setUint32(0x61746164); // "data" chunk
    setUint32(length - pos - 4);

    for (let i = 0; i < buffer.numberOfChannels; i++) {
      channels.push(buffer.getChannelData(i));
    }

    while (pos < length) {
      for (let i = 0; i < numOfChan; i++) {
        let sample = Math.max(-1, Math.min(1, channels[i][offset]));
        sample = sample < 0 ? sample * 0x8000 : sample * 0x7FFF;
        view.setInt16(pos, sample, true);
        pos += 2;
      }
      offset++;
    }

    return new Blob([bufferArr], { type: 'audio/wav' });
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto p-6 bg-[#161412] rounded-3xl border border-[#2d2822] shadow-xl text-left">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 pb-4 border-b border-[#2d2822]">
        <div>
          <h2 className="text-xl font-bold font-sans tracking-tight text-white flex items-center gap-2">
            <MicOff className="w-5 h-5 text-pink-500" />
            VOCAL REMOVER & ISOLATOR
          </h2>
          <p className="text-xs text-[#a39785] font-mono">Center-Channel Stereo Phase Cancellation Engine</p>
        </div>
        <div className="text-[10px] font-mono tracking-widest bg-pink-900/40 text-pink-500 px-2.5 py-1 rounded-md border border-pink-800">
          STUDIO QUALITY • 100% OFFLINE
        </div>
      </div>

      {!audioFile ? (
        <div className="border-2 border-dashed border-[#2d2822] hover:border-pink-500/50 transition duration-300 rounded-2xl p-10 text-center space-y-4 bg-[#11100e]">
          <div className="w-14 h-14 rounded-full bg-[#1b1916] flex items-center justify-center mx-auto border border-[#2d2822]">
            <Music className="w-6 h-6 text-[#8e816d]" />
          </div>
          <div className="space-y-1.5">
            <h3 className="text-sm font-bold text-white">Import your track to remove vocals</h3>
            <p className="text-xs text-[#8e816d] max-w-sm mx-auto leading-relaxed">
              Supports MP3, WAV, FLAC, and AAC. Your audio will be processed locally in real-time.
            </p>
          </div>
          <div>
            <label className="px-4 py-2.5 bg-pink-600 hover:bg-pink-500 text-white font-mono text-xs font-bold rounded-xl cursor-pointer shadow-md inline-block transition">
              CHOOSE FILE
              <input 
                type="file" 
                accept="audio/*" 
                onChange={handleFileUpload} 
                className="hidden" 
              />
            </label>
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          {/* File Metadata */}
          <div className="flex justify-between items-center bg-[#1b1916] rounded-xl p-3 border border-[#2d2822] text-xs font-mono">
            <div className="flex items-center space-x-2.5 text-white">
              <span className="p-1.5 rounded-lg bg-pink-500/10 text-pink-500">
                <Music className="w-4 h-4" />
              </span>
              <span className="font-bold truncate max-w-xs">{audioFile.name}</span>
              <span className="text-[#8e816d]">({(audioFile.size / (1024 * 1024)).toFixed(2)} MB)</span>
            </div>
            <button
              onClick={() => {
                stopPlayback();
                setAudioFile(null);
                setAudioBuffer(null);
              }}
              className="text-[#8e816d] hover:text-red-400 transition"
              title="Remove File"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>

          {/* Real-time Loading / Decoding indicator */}
          {isProcessing ? (
            <div className="text-center py-10 bg-[#11100e] rounded-2xl border border-[#2d2822] space-y-3">
              <div className="w-8 h-8 border-2 border-pink-500 border-t-transparent rounded-full animate-spin mx-auto" />
              <p className="text-xs font-mono text-[#8e816d]">Decoding Stereo Audio Buffer...</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* Left Column: DSP Controls */}
              <div className="md:col-span-1 space-y-5 bg-[#1b1916] border border-[#2d2822] p-4 rounded-2xl">
                <h3 className="text-xs font-mono text-[#a39785] border-b border-[#2d2822] pb-2 flex items-center">
                  <Sliders className="w-3.5 h-3.5 mr-1.5 text-pink-500" />
                  KARAOKE / REMOVAL DSP
                </h3>

                {/* Slider 1: Vocal Suppression Depth */}
                <div className="space-y-2">
                  <div className="flex justify-between text-[11px] font-mono">
                    <span className="text-[#8e816d]">Vocal Cut Depth</span>
                    <span className="text-pink-500 font-bold">{vocalCutDepth}%</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={vocalCutDepth}
                    onChange={(e) => setVocalCutDepth(parseInt(e.target.value))}
                    className="w-full accent-pink-500 bg-[#11100e] rounded-lg h-1.5 appearance-none cursor-pointer"
                  />
                  <p className="text-[10px] text-[#746957] font-mono leading-tight">
                    Inverts stereo center channels. 100% maximizes isolation of center panned lead vocals.
                  </p>
                </div>

                {/* Slider 2: Bass Preservation Filter */}
                <div className="space-y-2">
                  <div className="flex justify-between text-[11px] font-mono">
                    <span className="text-[#8e816d]">Preserve Bass Freq</span>
                    <span className="text-pink-500 font-bold">{lowPreserveFreq} Hz</span>
                  </div>
                  <input
                    type="range"
                    min="20"
                    max="400"
                    value={lowPreserveFreq}
                    onChange={(e) => setLowPreserveFreq(parseInt(e.target.value))}
                    className="w-full accent-pink-500 bg-[#11100e] rounded-lg h-1.5 appearance-none cursor-pointer"
                  />
                  <p className="text-[10px] text-[#746957] font-mono leading-tight">
                    Bypasses low sub-bass (like kicks/subs) from cancellation to preserve the low-end beat.
                  </p>
                </div>

                {/* Slider 3: Volume */}
                <div className="space-y-2 pt-2 border-t border-[#2d2822]/60">
                  <div className="flex justify-between text-[11px] font-mono">
                    <span className="text-[#8e816d] flex items-center"><Volume2 className="w-3 h-3 mr-1" /> Volume</span>
                    <span className="text-[#cfc4b2]">{volume}%</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={volume}
                    onChange={(e) => setVolume(parseInt(e.target.value))}
                    className="w-full accent-pink-500 bg-[#11100e] rounded-lg h-1.5 appearance-none cursor-pointer"
                  />
                </div>
              </div>

              {/* Right Column: Audio Playback & Visualizer */}
              <div className="md:col-span-2 space-y-5 bg-[#1b1916] border border-[#2d2822] p-5 rounded-2xl flex flex-col justify-between">
                <div className="space-y-4">
                  <div className="flex justify-between items-center">
                    <span className="text-xs font-mono text-[#a39785] flex items-center">
                      <Activity className="w-3.5 h-3.5 mr-1.5 text-pink-500" />
                      WAVEFORM MONITOR
                    </span>
                    <span className="text-[10px] font-mono text-[#8e816d]">
                      {audioBuffer ? `${audioBuffer.numberOfChannels} Channels / ${audioBuffer.sampleRate}Hz` : ''}
                    </span>
                  </div>

                  {/* Aesthetic Visualizer Simulation */}
                  <div className="h-28 bg-[#11100e] rounded-xl border border-[#2d2822] flex items-center justify-center overflow-hidden relative">
                    <div className="absolute inset-0 opacity-10 bg-[radial-gradient(#ec4899_1px,transparent_1px)] [background-size:16px_16px]" />
                    
                    {/* Simulated Waveform bars */}
                    <div className="flex items-center space-x-1.5 h-20 w-11/12">
                      {Array.from({ length: 48 }).map((_, i) => {
                        const randomFactor = Math.sin(i * 0.15) * 0.4 + 0.6;
                        const isPlayingClass = isPlaying ? 'animate-pulse' : '';
                        const height = `${Math.floor(randomFactor * 70)}%`;
                        
                        // Center channel reduction simulation
                        const activeReduction = (i > 15 && i < 32) ? (1 - (vocalCutDepth / 130)) : 1;
                        const finalHeight = `${Math.floor(randomFactor * 70 * activeReduction)}%`;

                        return (
                          <div 
                            key={i} 
                            style={{ height: finalHeight }}
                            className={`flex-1 rounded-sm transition-all duration-300 ${
                              isPlaying 
                                ? 'bg-pink-500/85 shadow-[0_0_8px_rgba(236,72,153,0.3)]' 
                                : 'bg-[#2d2822]'
                            }`}
                          />
                        );
                      })}
                    </div>
                  </div>

                  {/* Player Timeline Seek bar */}
                  <div className="space-y-1.5">
                    <input
                      type="range"
                      min="0"
                      max={duration || 100}
                      step="0.1"
                      value={currentTime}
                      onChange={handleSeek}
                      className="w-full accent-pink-500 bg-[#11100e] rounded-lg h-1.5 appearance-none cursor-pointer"
                    />
                    <div className="flex justify-between text-[10px] font-mono text-[#8e816d]">
                      <span>{currentTime ? `${Math.floor(currentTime / 60)}:${Math.floor(currentTime % 60).toString().padStart(2, '0')}` : '0:00'}</span>
                      <span>{duration ? `${Math.floor(duration / 60)}:${Math.floor(duration % 60).toString().padStart(2, '0')}` : '0:00'}</span>
                    </div>
                  </div>
                </div>

                {/* Player Controls & Export */}
                <div className="flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-3 pt-3 border-t border-[#2d2822]/40">
                  <div className="flex items-center space-x-2">
                    {isPlaying ? (
                      <button
                        onClick={pausePlayback}
                        className="px-4 py-2 bg-[#2d221d] border border-pink-500/30 text-pink-400 font-mono text-xs font-bold rounded-xl hover:bg-[#3d2b24] transition flex items-center space-x-2"
                      >
                        <Pause className="w-4 h-4 fill-current" />
                        <span>PAUSE</span>
                      </button>
                    ) : (
                      <button
                        onClick={startPlayback}
                        className="px-4 py-2 bg-pink-600 text-white font-mono text-xs font-bold rounded-xl hover:bg-pink-500 transition flex items-center space-x-2 shadow-lg shadow-pink-900/10"
                      >
                        <Play className="w-4 h-4 fill-current" />
                        <span>PLAY KARAOKE</span>
                      </button>
                    )}
                    <button
                      onClick={stopPlayback}
                      className="p-2 bg-[#1d1a16] border border-[#2d2822] text-[#8e816d] hover:text-white rounded-xl transition"
                      title="Stop Track"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>

                  <button
                    disabled={isExporting}
                    onClick={exportInstrumental}
                    className={`px-4 py-2.5 rounded-xl font-mono text-xs font-bold tracking-wider flex items-center justify-center space-x-2 border transition ${
                      isExporting 
                        ? 'bg-[#11100e] text-[#3c362e] border-transparent cursor-not-allowed' 
                        : 'bg-emerald-600 text-white border-emerald-500 shadow-md hover:bg-emerald-500'
                    }`}
                  >
                    {isExporting ? (
                      <>
                        <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        <span>EXPORTING...</span>
                      </>
                    ) : (
                      <>
                        <Download className="w-4 h-4" />
                        <span>EXPORT TRACK</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
