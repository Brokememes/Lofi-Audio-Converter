import React, { useState, useRef, useEffect } from 'react';
import { 
  Plus, 
  Trash2, 
  ArrowUp, 
  ArrowDown, 
  Music, 
  Download, 
  FolderPlus,
  Compass,
  Volume2
} from 'lucide-react';

interface JoinedTrackItem {
  id: string;
  file: File;
  buffer: AudioBuffer;
}

export default function AudioJoiner() {
  const [tracks, setTracks] = useState<JoinedTrackItem[]>([]);
  const [gapDuration, setGapDuration] = useState(0); // seconds between tracks
  const [isProcessing, setIsProcessing] = useState(false);
  const [isMerging, setIsMerging] = useState(false);

  const audioCtxRef = useRef<AudioContext | null>(null);

  useEffect(() => {
    return () => {
      if (audioCtxRef.current) {
        audioCtxRef.current.close();
      }
    };
  }, []);

  const handleFilesUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setIsProcessing(true);

    try {
      if (!audioCtxRef.current) {
        audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      }

      const newTracks: JoinedTrackItem[] = [];

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const arrayBuffer = await file.arrayBuffer();
        const decodedBuffer = await audioCtxRef.current.decodeAudioData(arrayBuffer);

        newTracks.push({
          id: Math.random().toString(36).substring(2, 9),
          file,
          buffer: decodedBuffer
        });
      }

      setTracks(prev => [...prev, ...newTracks]);
    } catch (err) {
      console.error(err);
      alert('Failed to decode one or more uploaded files.');
    } finally {
      setIsProcessing(false);
    }
  };

  const moveTrack = (index: number, direction: 'up' | 'down') => {
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= tracks.length) return;

    const updated = [...tracks];
    const temp = updated[index];
    updated[index] = updated[targetIndex];
    updated[targetIndex] = temp;

    setTracks(updated);
  };

  const removeTrack = (id: string) => {
    setTracks(prev => prev.filter(t => t.id !== id));
  };

  const handleMergeAndExport = async () => {
    if (tracks.length < 2) {
      alert('Please add at least 2 tracks to join them.');
      return;
    }

    setIsMerging(true);

    try {
      const sampleRate = tracks[0].buffer.sampleRate;
      const numChannels = Math.max(...tracks.map(t => t.buffer.numberOfChannels));
      
      // Calculate total sample length including gaps
      let totalSamples = 0;
      tracks.forEach((track, idx) => {
        totalSamples += track.buffer.length;
        if (idx < tracks.length - 1) {
          totalSamples += Math.floor(gapDuration * sampleRate);
        }
      });

      // Create Offline context
      const offlineCtx = new OfflineAudioContext(numChannels, totalSamples, sampleRate);
      const mergedBuffer = offlineCtx.createBuffer(numChannels, totalSamples, sampleRate);

      // Merge sequentially
      let currentSampleOffset = 0;
      tracks.forEach((track, idx) => {
        const buffer = track.buffer;

        for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
          const channelData = buffer.getChannelData(channel);
          const destChannelData = mergedBuffer.getChannelData(channel);
          
          // Copy samples
          destChannelData.set(channelData, currentSampleOffset);
        }

        currentSampleOffset += buffer.length;

        // Add silent gap
        if (idx < tracks.length - 1) {
          currentSampleOffset += Math.floor(gapDuration * sampleRate);
        }
      });

      // Convert merged buffer to WAV blob
      const wavBlob = bufferToWavBlob(mergedBuffer);
      const downloadUrl = URL.createObjectURL(wavBlob);
      const downloadLink = document.createElement('a');
      downloadLink.href = downloadUrl;
      downloadLink.download = `merged_audio_station_${Date.now().toString().substring(6)}.wav`;
      document.body.appendChild(downloadLink);
      downloadLink.click();
      document.body.removeChild(downloadLink);
      URL.revokeObjectURL(downloadUrl);
    } catch (err) {
      console.error(err);
      alert('Failed to merge audio tracks. Make sure they use compatible structures.');
    } finally {
      setIsMerging(false);
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
            <Compass className="w-5 h-5 text-amber-500 animate-pulse" />
            AUDIO JOINER & MERGER
          </h2>
          <p className="text-xs text-[#a39785] font-mono">Sequentially compile multiple audio clips into a continuous file</p>
        </div>
        <div className="text-[10px] font-mono tracking-widest bg-amber-900/40 text-amber-500 px-2.5 py-1 rounded-md border border-amber-850">
          STUDIO EXPORT • GAPLESS MIXING
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Left Hand: Upload & Options */}
        <div className="bg-[#1b1916] border border-[#2d2822] p-4 rounded-2xl h-fit space-y-4">
          <h3 className="text-xs font-mono text-[#a39785] border-b border-[#2d2822] pb-2 flex items-center gap-2">
            <FolderPlus className="w-4 h-4 text-amber-500" />
            LOAD TRACKS
          </h3>

          <div>
            <label className="w-full py-4 px-4 bg-[#11100e] border border-dashed border-[#2d2822] hover:border-amber-500/50 rounded-xl text-center cursor-pointer flex flex-col items-center justify-center gap-2 transition duration-200">
              <Plus className="w-5 h-5 text-amber-500" />
              <span className="text-[11px] font-mono text-[#8e816d] font-bold">ADD AUDIO CLIPS</span>
              <span className="text-[9px] font-mono text-[#746957]">Upload multiple WAV/MP3</span>
              <input 
                type="file" 
                multiple 
                accept="audio/*" 
                onChange={handleFilesUpload} 
                className="hidden" 
              />
            </label>
          </div>

          <div className="space-y-2 pt-2 border-t border-[#2d2822]/60">
            <div className="flex justify-between text-[11px] font-mono">
              <span className="text-[#8e816d]">Gap Between Tracks (sec)</span>
              <span className="text-amber-500 font-bold">{gapDuration}s</span>
            </div>
            <input
              type="range"
              min="0"
              max="5"
              step="0.5"
              value={gapDuration}
              onChange={(e) => setGapDuration(parseFloat(e.target.value))}
              className="w-full accent-amber-500 bg-[#11100e] rounded-lg h-1 appearance-none cursor-pointer"
            />
            <p className="text-[9px] text-[#746957] font-mono leading-tight">
              Adds silent buffer gaps between consecutive concatenated songs.
            </p>
          </div>

          <button
            disabled={tracks.length < 2 || isMerging}
            onClick={handleMergeAndExport}
            className={`w-full py-2.5 rounded-xl font-mono text-xs font-bold tracking-wider flex items-center justify-center space-x-2 border transition ${
              tracks.length < 2 || isMerging
                ? 'bg-[#11100e] text-[#3c362e] border-transparent cursor-not-allowed' 
                : 'bg-emerald-600 text-white border-emerald-500 shadow-md hover:bg-emerald-500'
            }`}
          >
            {isMerging ? (
              <>
                <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                <span>COMPILING...</span>
              </>
            ) : (
              <>
                <Download className="w-4 h-4" />
                <span>MERGE & EXPORT</span>
              </>
            )}
          </button>
        </div>

        {/* Right Hand: Sequencer Playlist */}
        <div className="md:col-span-2 bg-[#1b1916] border border-[#2d2822] p-4 rounded-2xl space-y-4">
          <div className="flex justify-between items-center border-b border-[#2d2822] pb-2">
            <h3 className="text-xs font-mono text-[#a39785] flex items-center gap-1.5">
              <Music className="w-4 h-4 text-amber-500" />
              PLAYLIST SEQUENCE ({tracks.length} Clips)
            </h3>
            {tracks.length > 0 && (
              <button 
                onClick={() => setTracks([])}
                className="text-[10px] font-mono text-red-400 hover:text-red-300 transition"
              >
                Clear All
              </button>
            )}
          </div>

          {isProcessing ? (
            <div className="text-center py-12 bg-[#11100e] rounded-xl border border-[#2d2822] space-y-2">
              <div className="w-6 h-6 border-2 border-amber-500 border-t-transparent rounded-full animate-spin mx-auto" />
              <p className="text-[10px] font-mono text-[#8e816d]">Decoding audio buffers...</p>
            </div>
          ) : tracks.length === 0 ? (
            <div className="text-center py-16 bg-[#11100e] rounded-xl border border-dashed border-[#2d2822] space-y-2">
              <p className="text-xs font-mono text-[#8e816d]">No tracks added yet</p>
              <p className="text-[10px] text-[#746957] font-mono">Add files in the sidebar to build your song compilation</p>
            </div>
          ) : (
            <div className="space-y-2.5 max-h-[350px] overflow-y-auto pr-1">
              {tracks.map((track, idx) => (
                <div 
                  key={track.id}
                  className="flex items-center justify-between bg-[#11100e] border border-[#2d2822] rounded-xl p-3 hover:border-amber-500/30 transition-all duration-150"
                >
                  <div className="flex items-center space-x-3 truncate max-w-sm">
                    <span className="w-5 h-5 rounded-md bg-[#1b1916] text-[#8e816d] flex items-center justify-center font-mono text-[10px] border border-[#2d2822] shrink-0 font-bold">
                      {idx + 1}
                    </span>
                    <div className="truncate">
                      <p className="text-xs font-bold text-white truncate font-sans">{track.file.name}</p>
                      <p className="text-[10px] text-[#8e816d] font-mono">
                        {track.buffer.duration.toFixed(1)}s • {track.buffer.sampleRate}Hz • {track.buffer.numberOfChannels}Ch
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center space-x-1.5 shrink-0">
                    <button
                      disabled={idx === 0}
                      onClick={() => moveTrack(idx, 'up')}
                      className="p-1.5 bg-[#1b1916] border border-[#2d2822] text-[#8e816d] hover:text-white rounded-lg transition disabled:opacity-20"
                    >
                      <ArrowUp className="w-3.5 h-3.5" />
                    </button>
                    <button
                      disabled={idx === tracks.length - 1}
                      onClick={() => moveTrack(idx, 'down')}
                      className="p-1.5 bg-[#1b1916] border border-[#2d2822] text-[#8e816d] hover:text-white rounded-lg transition disabled:opacity-20"
                    >
                      <ArrowDown className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => removeTrack(track.id)}
                      className="p-1.5 bg-[#1b1916] border border-[#2d2822] text-[#8e816d] hover:text-red-400 rounded-lg transition"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
