import React, { useState, useRef, useEffect } from 'react';
import { 
  Play, 
  Pause, 
  Download, 
  Trash2, 
  Sliders, 
  Music, 
  Scissors, 
  Volume2 
} from 'lucide-react';

export default function AudioCutter() {
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [audioBuffer, setAudioBuffer] = useState<AudioBuffer | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  // Crop Region (in seconds)
  const [trimStart, setTrimStart] = useState(0);
  const [trimEnd, setTrimEnd] = useState(10);
  const [volume, setVolume] = useState(85);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const sourceNodeRef = useRef<AudioBufferSourceNode | null>(null);
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

  // Update volume node on change
  useEffect(() => {
    if (masterGainRef.current && audioCtxRef.current) {
      masterGainRef.current.gain.setTargetAtTime(volume / 100, audioCtxRef.current.currentTime, 0.05);
    }
  }, [volume]);

  // Draw Waveform once audio buffer is loaded
  useEffect(() => {
    if (audioBuffer) {
      drawWaveform();
      // Reset trim bounds
      setTrimStart(0);
      setTrimEnd(Math.min(audioBuffer.duration, 15)); // default to first 15 seconds
    }
  }, [audioBuffer]);

  // Redraw when crop boundaries shift
  useEffect(() => {
    if (audioBuffer) {
      drawWaveform();
    }
  }, [trimStart, trimEnd, currentTime]);

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
      console.error(err);
      alert('Failed to load audio file.');
    } finally {
      setIsProcessing(false);
    }
  };

  // Draw genuine PCM peaks on HTML Canvas
  const drawWaveform = () => {
    const canvas = canvasRef.current;
    if (!canvas || !audioBuffer) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;
    ctx.clearRect(0, 0, width, height);

    const data = audioBuffer.getChannelData(0);
    const step = Math.ceil(data.length / width);
    const amp = height / 2;

    // Draw background peaks
    ctx.fillStyle = '#221e1a';
    for (let i = 0; i < width; i++) {
      let min = 1.0;
      let max = -1.0;
      for (let j = 0; j < step; j++) {
        const datum = data[i * step + j];
        if (datum < min) min = datum;
        if (datum > max) max = datum;
      }
      ctx.fillRect(i, amp + min * amp, 1, Math.max(1, (max - min) * amp));
    }

    // Highlight selected/cropped range
    const startX = (trimStart / duration) * width;
    const endX = (trimEnd / duration) * width;

    ctx.fillStyle = 'rgba(245, 158, 11, 0.15)'; // translucent amber background selection
    ctx.fillRect(startX, 0, endX - startX, height);

    // Highlight selected peaks
    ctx.fillStyle = '#f59e0b'; // solid amber for active region
    for (let i = Math.floor(startX); i < Math.ceil(endX); i++) {
      let min = 1.0;
      let max = -1.0;
      for (let j = 0; j < step; j++) {
        const datum = data[i * step + j];
        if (datum < min) min = datum;
        if (datum > max) max = datum;
      }
      ctx.fillRect(i, amp + min * amp, 1, Math.max(1, (max - min) * amp));
    }

    // Draw playhead marker inside selection
    if (currentTime >= trimStart && currentTime <= trimEnd) {
      const playheadX = (currentTime / duration) * width;
      ctx.strokeStyle = '#10b981'; // emerald green playhead
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(playheadX, 0);
      ctx.lineTo(playheadX, height);
      ctx.stroke();
    }

    // Draw start/end border markers
    ctx.strokeStyle = '#f59e0b';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(startX, 0);
    ctx.lineTo(startX, height);
    ctx.moveTo(endX, 0);
    ctx.lineTo(endX, height);
    ctx.stroke();
  };

  const startPlayback = () => {
    if (!audioBuffer || !audioCtxRef.current) return;

    if (audioCtxRef.current.state === 'suspended') {
      audioCtxRef.current.resume();
    }

    // Stop existing source
    if (sourceNodeRef.current) {
      try {
        sourceNodeRef.current.stop();
      } catch (e) {}
    }

    const ctx = audioCtxRef.current;
    const source = ctx.createBufferSource();
    source.buffer = audioBuffer;
    sourceNodeRef.current = source;

    const masterGain = ctx.createGain();
    masterGain.gain.value = volume / 100;
    masterGainRef.current = masterGain;

    source.connect(masterGain);
    masterGain.connect(ctx.destination);

    // Playback should start at the trim-start marker OR the current paused time
    // Ensure we don't start before trimStart or after trimEnd
    let offset = pausedTimeRef.current;
    if (offset < trimStart || offset > trimEnd) {
      offset = trimStart;
    }

    const playDuration = trimEnd - offset;
    if (playDuration <= 0) return;

    source.start(0, offset, playDuration);
    startTimeRef.current = ctx.currentTime - offset;
    setIsPlaying(true);

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
    pausedTimeRef.current = trimStart;
    setCurrentTime(trimStart);
    setIsPlaying(false);
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }
  };

  const updateProgress = () => {
    if (!audioCtxRef.current || !isPlaying) return;
    const curr = audioCtxRef.current.currentTime - startTimeRef.current;
    if (curr >= trimEnd) {
      stopPlayback();
    } else {
      setCurrentTime(curr);
      animationFrameRef.current = requestAnimationFrame(updateProgress);
    }
  };

  // Trim buffer physically in PCM domains
  const handleCropAndExport = async () => {
    if (!audioBuffer || !audioFile) return;
    setIsExporting(true);

    try {
      const sampleRate = audioBuffer.sampleRate;
      const startSample = Math.floor(trimStart * sampleRate);
      const endSample = Math.floor(trimEnd * sampleRate);
      const trimmedLength = endSample - startSample;

      if (trimmedLength <= 0) {
        alert('Invalid crop boundaries selected.');
        setIsExporting(false);
        return;
      }

      // Initialize offline context for trimmed size
      const offlineCtx = new OfflineAudioContext(
        audioBuffer.numberOfChannels,
        trimmedLength,
        sampleRate
      );

      const croppedBuffer = offlineCtx.createBuffer(
        audioBuffer.numberOfChannels,
        trimmedLength,
        sampleRate
      );

      // Map buffers
      for (let channel = 0; channel < audioBuffer.numberOfChannels; channel++) {
        const originalData = audioBuffer.getChannelData(channel);
        const croppedData = croppedBuffer.getChannelData(channel);
        for (let i = 0; i < trimmedLength; i++) {
          croppedData[i] = originalData[startSample + i];
        }
      }

      // Convert croppedBuffer to WAV directly
      const wavBlob = bufferToWavBlob(croppedBuffer);
      const downloadUrl = URL.createObjectURL(wavBlob);
      const downloadLink = document.createElement('a');
      const cleanName = audioFile.name.substring(0, audioFile.name.lastIndexOf('.')) || audioFile.name;
      downloadLink.href = downloadUrl;
      downloadLink.download = `${cleanName}_cropped.wav`;
      document.body.appendChild(downloadLink);
      downloadLink.click();
      document.body.removeChild(downloadLink);
      URL.revokeObjectURL(downloadUrl);
    } catch (err) {
      console.error(err);
      alert('Failed to crop and export audio track.');
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
            <Scissors className="w-5 h-5 text-amber-500 animate-pulse" />
            VISUAL AUDIO CUTTER & TRIMMER
          </h2>
          <p className="text-xs text-[#a39785] font-mono">Visually trim, crop, and segment audio tracks losslessly</p>
        </div>
        <div className="text-[10px] font-mono tracking-widest bg-amber-900/40 text-amber-500 px-2.5 py-1 rounded-md border border-amber-850">
          PCM QUALITY • LOSSLESS CROPPING
        </div>
      </div>

      {!audioFile ? (
        <div className="border-2 border-dashed border-[#2d2822] hover:border-amber-500/50 transition duration-300 rounded-2xl p-10 text-center space-y-4 bg-[#11100e]">
          <div className="w-14 h-14 rounded-full bg-[#1b1916] flex items-center justify-center mx-auto border border-[#2d2822]">
            <Scissors className="w-6 h-6 text-[#8e816d]" />
          </div>
          <div className="space-y-1.5">
            <h3 className="text-sm font-bold text-white">Import track to cut or trim</h3>
            <p className="text-xs text-[#8e816d] max-w-sm mx-auto leading-relaxed">
              Upload any MP3 or WAV file. Drag handles on the visual waveform to crop exactly what you need.
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

          {isProcessing ? (
            <div className="text-center py-10 bg-[#11100e] rounded-2xl border border-[#2d2822] space-y-3">
              <div className="w-8 h-8 border-2 border-amber-500 border-t-transparent rounded-full animate-spin mx-auto" />
              <p className="text-xs font-mono text-[#8e816d]">Analyzing PCM Waveform Peaks...</p>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Responsive Waveform Viewer */}
              <div className="bg-[#11100e] rounded-2xl border border-[#2d2822] p-4 space-y-3">
                <div className="flex justify-between text-xs font-mono text-[#8e816d]">
                  <span>Visual Waveform Peak Detector</span>
                  <span>Duration: {duration.toFixed(2)}s</span>
                </div>
                
                <div className="relative bg-[#0d0c0b] rounded-xl overflow-hidden border border-[#1f1b17]">
                  <canvas 
                    ref={canvasRef} 
                    width={800} 
                    height={140} 
                    className="w-full h-36 block"
                  />
                </div>
              </div>

              {/* Crop Controls & Playback */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* Boundaries adjustment column */}
                <div className="bg-[#1b1916] border border-[#2d2822] p-4 rounded-2xl space-y-4">
                  <h3 className="text-xs font-mono text-[#a39785] border-b border-[#2d2822] pb-2 flex items-center">
                    <Sliders className="w-3.5 h-3.5 mr-1.5 text-amber-500" />
                    CROP RANGE SELECTION
                  </h3>

                  {/* Trim Start Input */}
                  <div className="space-y-2">
                    <div className="flex justify-between text-[11px] font-mono">
                      <span className="text-[#8e816d]">Trim Start (Seconds)</span>
                      <span className="text-amber-500 font-bold">{trimStart.toFixed(2)}s</span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max={trimEnd || duration}
                      step="0.05"
                      value={trimStart}
                      onChange={(e) => {
                        const val = parseFloat(e.target.value);
                        setTrimStart(val);
                        if (currentTime < val) setCurrentTime(val);
                      }}
                      className="w-full accent-amber-500 bg-[#11100e] rounded-lg h-1.5 appearance-none cursor-pointer"
                    />
                  </div>

                  {/* Trim End Input */}
                  <div className="space-y-2">
                    <div className="flex justify-between text-[11px] font-mono">
                      <span className="text-[#8e816d]">Trim End (Seconds)</span>
                      <span className="text-amber-500 font-bold">{trimEnd.toFixed(2)}s</span>
                    </div>
                    <input
                      type="range"
                      min={trimStart}
                      max={duration}
                      step="0.05"
                      value={trimEnd}
                      onChange={(e) => {
                        const val = parseFloat(e.target.value);
                        setTrimEnd(val);
                        if (currentTime > val) setCurrentTime(val);
                      }}
                      className="w-full accent-amber-500 bg-[#11100e] rounded-lg h-1.5 appearance-none cursor-pointer"
                    />
                  </div>

                  {/* Volume Slider */}
                  <div className="space-y-2 pt-2 border-t border-[#2d2822]/60">
                    <div className="flex justify-between text-[11px] font-mono">
                      <span className="text-[#8e816d] flex items-center"><Volume2 className="w-3.5 h-3.5 mr-1" /> Preview Volume</span>
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

                {/* Processing Summary Column */}
                <div className="md:col-span-2 bg-[#1b1916] border border-[#2d2822] p-5 rounded-2xl flex flex-col justify-between">
                  <div className="space-y-4">
                    <h3 className="text-xs font-mono text-[#a39785] flex items-center border-b border-[#2d2822] pb-2">
                      <Scissors className="w-3.5 h-3.5 mr-1.5 text-amber-500" />
                      TRIM SUMMARY & PREVIEW
                    </h3>

                    <div className="grid grid-cols-2 gap-4 text-xs font-mono bg-[#11100e] p-3 rounded-xl border border-[#2d2822]">
                      <div>
                        <span className="text-[#8e816d] block mb-0.5">Trimming Range</span>
                        <span className="text-white font-bold">{trimStart.toFixed(2)}s - {trimEnd.toFixed(2)}s</span>
                      </div>
                      <div>
                        <span className="text-[#8e816d] block mb-0.5">Total Crop Duration</span>
                        <span className="text-amber-500 font-bold">{(trimEnd - trimStart).toFixed(2)} seconds</span>
                      </div>
                    </div>

                    <p className="text-[11px] text-[#8e816d] leading-relaxed">
                      Press "PLAY REGION" to preview your crop boundaries. The player will automatically stop once it reaches your chosen Trim End boundary.
                    </p>
                  </div>

                  {/* Active Playback controls & Compile */}
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
                          <span>PLAY REGION</span>
                        </button>
                      )}
                      <button
                        onClick={stopPlayback}
                        className="p-2 bg-[#1d1a16] border border-[#2d2822] text-[#8e816d] hover:text-white rounded-xl transition"
                        title="Reset Playhead"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>

                    <button
                      disabled={isExporting}
                      onClick={handleCropAndExport}
                      className={`px-4 py-2.5 rounded-xl font-mono text-xs font-bold tracking-wider flex items-center justify-center space-x-2 border transition ${
                        isExporting 
                          ? 'bg-[#11100e] text-[#3c362e] border-transparent cursor-not-allowed' 
                          : 'bg-emerald-600 text-white border-emerald-500 shadow-md hover:bg-emerald-500'
                      }`}
                    >
                      {isExporting ? (
                        <>
                          <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                          <span>EXPORTING CROP...</span>
                        </>
                      ) : (
                        <>
                          <Download className="w-4 h-4" />
                          <span>EXPORT TRUNCATED</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
