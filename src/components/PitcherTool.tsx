import React, { useState, useRef, useEffect } from 'react';
import { 
  Play, 
  Pause, 
  Volume2, 
  Download, 
  Trash2, 
  Sliders, 
  Music, 
  ChevronRight,
  Activity,
  Maximize2
} from 'lucide-react';
import { TimeDomainPitchShifter } from '../audioEngine';

export default function PitcherTool() {
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [audioBuffer, setAudioBuffer] = useState<AudioBuffer | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  
  // Independent controls
  const [pitchShift, setPitchShift] = useState(0); // -12 to +12 semitones
  const [tempoScale, setTempoScale] = useState(100); // 50% to 150%
  const [volume, setVolume] = useState(80);

  const audioCtxRef = useRef<AudioContext | null>(null);
  const sourceNodeRef = useRef<AudioBufferSourceNode | null>(null);
  const pitchShifterRef = useRef<TimeDomainPitchShifter | null>(null);
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

    // Mathematically coordinate playbackRate and pitchShifter pitch
    const speedFactor = tempoScale / 100;
    
    // Set source node playback rate
    if (sourceNodeRef.current) {
      sourceNodeRef.current.playbackRate.setTargetAtTime(speedFactor, t, 0.05);
    }

    // Adjust pitch shifter pitch to cancel the speed-change pitch shift
    // and apply the desired user-requested pitch shift!
    // Change in pitch due to speed factor: speedPitchChange = 12 * log2(speedFactor)
    const speedPitchChange = 12 * Math.log2(speedFactor);
    const targetShifterShift = pitchShift - speedPitchChange;

    if (pitchShifterRef.current) {
      pitchShifterRef.current.setPitch(targetShifterShift);
    }

    if (masterGainRef.current) {
      masterGainRef.current.gain.setTargetAtTime(volume / 100, t, 0.05);
    }
  }, [pitchShift, tempoScale, volume]);

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

    // Create custom Time Domain Pitch Shifter
    const shifter = new TimeDomainPitchShifter(ctx);
    pitchShifterRef.current = shifter;

    // Master volume control
    const masterGain = ctx.createGain();
    masterGain.gain.value = volume / 100;
    masterGainRef.current = masterGain;

    // Connect source -> shifter -> master gain -> destination
    source.connect(shifter.input);
    shifter.output.connect(masterGain);
    masterGain.connect(ctx.destination);

    // Apply exact initial rate and pitch shift parameters
    const speedFactor = tempoScale / 100;
    source.playbackRate.value = speedFactor;

    const speedPitchChange = 12 * Math.log2(speedFactor);
    const targetShifterShift = pitchShift - speedPitchChange;
    shifter.setPitch(targetShifterShift);

    // Start playback
    const offset = pausedTimeRef.current;
    source.start(0, offset);
    startTimeRef.current = ctx.currentTime - (offset / speedFactor);
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
      const speedFactor = tempoScale / 100;
      pausedTimeRef.current = (audioCtxRef.current.currentTime - startTimeRef.current) * speedFactor;
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
    const speedFactor = tempoScale / 100;
    const curr = (audioCtxRef.current.currentTime - startTimeRef.current) * speedFactor;
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

  // Offline rendering of the pitch-shifter and tempo-scaled track
  const exportPitchedTrack = async () => {
    if (!audioBuffer || !audioFile) return;
    setIsExporting(true);

    try {
      const sampleRate = audioBuffer.sampleRate;
      const speedFactor = tempoScale / 100;
      
      // Calculate output length in offline audio context (adjusted by tempo/speed scale)
      const outputDuration = audioBuffer.duration / speedFactor;
      const offlineCtx = new OfflineAudioContext(2, sampleRate * outputDuration, sampleRate);

      const offlineSource = offlineCtx.createBufferSource();
      offlineSource.buffer = audioBuffer;

      // Create Shifter inside Offline Context
      const shifter = new TimeDomainPitchShifter(offlineCtx);

      // Connect Offline graph
      offlineSource.connect(shifter.input);
      shifter.output.connect(offlineCtx.destination);

      // Set speed rate
      offlineSource.playbackRate.setValueAtTime(speedFactor, 0);

      // Set pitch shift balance
      const speedPitchChange = 12 * Math.log2(speedFactor);
      const targetShifterShift = pitchShift - speedPitchChange;
      shifter.setPitch(targetShifterShift);

      offlineSource.start(0);

      // Render audio
      const renderedBuffer = await offlineCtx.startRendering();

      // Convert to WAV
      const wavBlob = bufferToWavBlob(renderedBuffer);
      const downloadUrl = URL.createObjectURL(wavBlob);
      const downloadLink = document.createElement('a');
      const cleanName = audioFile.name.substring(0, audioFile.name.lastIndexOf('.')) || audioFile.name;
      downloadLink.href = downloadUrl;
      downloadLink.download = `${cleanName}_pitch_${pitchShift}st_speed_${tempoScale}pct.wav`;
      document.body.appendChild(downloadLink);
      downloadLink.click();
      document.body.removeChild(downloadLink);
      URL.revokeObjectURL(downloadUrl);
    } catch (err) {
      console.error(err);
      alert('Failed to export pitch/tempo modified track. Please try again.');
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
            <Maximize2 className="w-5 h-5 text-amber-500 animate-pulse" />
            PITCH & TEMPO CHANGER
          </h2>
          <p className="text-xs text-[#a39785] font-mono">Independent Micro-Tuning & Speed Warping Engine</p>
        </div>
        <div className="text-[10px] font-mono tracking-widest bg-amber-900/40 text-amber-500 px-2.5 py-1 rounded-md border border-amber-850">
          STUDIO QUALITY • PHASE VOCODER
        </div>
      </div>

      {!audioFile ? (
        <div className="border-2 border-dashed border-[#2d2822] hover:border-amber-500/50 transition duration-300 rounded-2xl p-10 text-center space-y-4 bg-[#11100e]">
          <div className="w-14 h-14 rounded-full bg-[#1b1916] flex items-center justify-center mx-auto border border-[#2d2822]">
            <Music className="w-6 h-6 text-[#8e816d]" />
          </div>
          <div className="space-y-1.5">
            <h3 className="text-sm font-bold text-white">Import your track to pitch/tempo stretch</h3>
            <p className="text-xs text-[#8e816d] max-w-sm mx-auto leading-relaxed">
              Adjust pitch and speed independently. Supports MP3, WAV, FLAC, and AAC.
            </p>
          </div>
          <div>
            <label className="px-4 py-2.5 bg-amber-600 hover:bg-amber-500 text-[#141210] font-mono text-xs font-bold rounded-xl cursor-pointer shadow-md inline-block transition">
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
              <span className="p-1.5 rounded-lg bg-amber-500/10 text-amber-500">
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
              <div className="w-8 h-8 border-2 border-amber-500 border-t-transparent rounded-full animate-spin mx-auto" />
              <p className="text-xs font-mono text-[#8e816d]">Decoding Stereo Audio Buffer...</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* Left Column: DSP Controls */}
              <div className="md:col-span-1 space-y-5 bg-[#1b1916] border border-[#2d2822] p-4 rounded-2xl">
                <h3 className="text-xs font-mono text-[#a39785] border-b border-[#2d2822] pb-2 flex items-center">
                  <Sliders className="w-3.5 h-3.5 mr-1.5 text-amber-500" />
                  PITCH & TEMPO WARPING
                </h3>

                {/* Slider 1: Pitch Shift */}
                <div className="space-y-2">
                  <div className="flex justify-between text-[11px] font-mono">
                    <span className="text-[#8e816d]">Pitch Shift (Semitones)</span>
                    <span className="text-amber-500 font-bold">{pitchShift > 0 ? `+${pitchShift}` : pitchShift} semitones</span>
                  </div>
                  <input
                    type="range"
                    min="-12"
                    max="12"
                    value={pitchShift}
                    onChange={(e) => setPitchShift(parseInt(e.target.value))}
                    className="w-full accent-amber-500 bg-[#11100e] rounded-lg h-1.5 appearance-none cursor-pointer"
                  />
                  <div className="flex justify-between text-[9px] text-[#746957] font-mono">
                    <span>-1 Octave</span>
                    <span>0 (Normal)</span>
                    <span>+1 Octave</span>
                  </div>
                </div>

                {/* Slider 2: Speed / Tempo Scale */}
                <div className="space-y-2 pt-2 border-t border-[#2d2822]/60">
                  <div className="flex justify-between text-[11px] font-mono">
                    <span className="text-[#8e816d]">Playback Speed (%)</span>
                    <span className="text-amber-500 font-bold">{tempoScale}%</span>
                  </div>
                  <input
                    type="range"
                    min="50"
                    max="150"
                    value={tempoScale}
                    onChange={(e) => setTempoScale(parseInt(e.target.value))}
                    className="w-full accent-amber-500 bg-[#11100e] rounded-lg h-1.5 appearance-none cursor-pointer"
                  />
                  <div className="flex justify-between text-[9px] text-[#746957] font-mono">
                    <span>0.5x Slow</span>
                    <span>1.0x (Normal)</span>
                    <span>1.5x Fast</span>
                  </div>
                </div>

                {/* Slider 3: Volume */}
                <div className="space-y-2 pt-4 border-t border-[#2d2822]/60">
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
                    className="w-full accent-amber-500 bg-[#11100e] rounded-lg h-1.5 appearance-none cursor-pointer"
                  />
                </div>
              </div>

              {/* Right Column: Audio Playback & Visualizer */}
              <div className="md:col-span-2 space-y-5 bg-[#1b1916] border border-[#2d2822] p-5 rounded-2xl flex flex-col justify-between">
                <div className="space-y-4">
                  <div className="flex justify-between items-center">
                    <span className="text-xs font-mono text-[#a39785] flex items-center">
                      <Activity className="w-3.5 h-3.5 mr-1.5 text-amber-500" />
                      SPECTRAL ENVELOPE MONITOR
                    </span>
                    <span className="text-[10px] font-mono text-[#8e816d]">
                      Speed: {(tempoScale / 100).toFixed(2)}x • Pitch: {pitchShift > 0 ? `+${pitchShift}` : pitchShift}st
                    </span>
                  </div>

                  {/* Aesthetic Visualizer Simulation */}
                  <div className="h-28 bg-[#11100e] rounded-xl border border-[#2d2822] flex items-center justify-center overflow-hidden relative">
                    <div className="absolute inset-0 opacity-10 bg-[radial-gradient(#f59e0b_1px,transparent_1px)] [background-size:16px_16px]" />
                    
                    {/* Simulated Waveform bars */}
                    <div className="flex items-center space-x-1.5 h-20 w-11/12">
                      {Array.from({ length: 48 }).map((_, i) => {
                        // Apply pitch-stretching visual factor
                        const frequencyFactor = (12 + pitchShift) / 12;
                        const mathPos = i * 0.15 * frequencyFactor;
                        const randomFactor = Math.sin(mathPos) * 0.4 + 0.6;
                        const height = `${Math.floor(randomFactor * 75)}%`;

                        return (
                          <div 
                            key={i} 
                            style={{ height }}
                            className={`flex-1 rounded-sm transition-all duration-300 ${
                              isPlaying 
                                ? 'bg-amber-500/85 shadow-[0_0_8px_rgba(245,158,11,0.3)] animate-pulse' 
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
                      className="w-full accent-amber-500 bg-[#11100e] rounded-lg h-1.5 appearance-none cursor-pointer"
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
                        className="px-4 py-2 bg-[#2d221d] border border-amber-500/30 text-amber-400 font-mono text-xs font-bold rounded-xl hover:bg-[#3d2b24] transition flex items-center space-x-2"
                      >
                        <Pause className="w-4 h-4 fill-current" />
                        <span>PAUSE</span>
                      </button>
                    ) : (
                      <button
                        onClick={startPlayback}
                        className="px-4 py-2 bg-amber-600 text-[#141210] font-mono text-xs font-bold rounded-xl hover:bg-amber-500 transition flex items-center space-x-2 shadow-lg shadow-amber-900/10"
                      >
                        <Play className="w-4 h-4 fill-current ml-0.5" />
                        <span>PLAY MODIFIED</span>
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
                    onClick={exportPitchedTrack}
                    className={`px-4 py-2.5 rounded-xl font-mono text-xs font-bold tracking-wider flex items-center justify-center space-x-2 border transition ${
                      isExporting 
                        ? 'bg-[#11100e] text-[#3c362e] border-transparent cursor-not-allowed' 
                        : 'bg-emerald-600 text-white border-emerald-500 shadow-md hover:bg-emerald-500'
                    }`}
                  >
                    {isExporting ? (
                      <>
                        <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        <span>RENDERING STRETCH...</span>
                      </>
                    ) : (
                      <>
                        <Download className="w-4 h-4" />
                        <span>EXPORT WARPED</span>
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
