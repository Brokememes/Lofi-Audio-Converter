import React, { useState, useRef, useEffect } from 'react';
import { 
  Play, 
  Pause, 
  Download, 
  Trash2, 
  Sliders, 
  Mic, 
  Square, 
  Volume2, 
  Activity,
  Radio
} from 'lucide-react';
import { TimeDomainPitchShifter } from '../audioEngine';

export default function VoiceRecorder() {
  const [isRecording, setIsRecording] = useState(false);
  const [recordedChunks, setRecordedChunks] = useState<Blob[]>([]);
  const [recordingUrl, setRecordingUrl] = useState<string | null>(null);
  const [volumeLevel, setVolumeLevel] = useState(0); // 0 to 100
  const [micState, setMicState] = useState<'idle' | 'recording' | 'preview'>('idle');

  // Live Processing States
  const [pitchShift, setPitchShift] = useState(0); // -12 to +12
  const [echoFeedback, setEchoFeedback] = useState(0); // 0 to 100
  const [bassBoost, setBassBoost] = useState(0); // 0 to 100
  const [reverbMix, setReverbMix] = useState(0); // 0 to 100
  const [monitorVoice, setMonitorVoice] = useState(false); // listen in headphones

  const audioCtxRef = useRef<AudioContext | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const micSourceNodeRef = useRef<MediaStreamAudioSourceNode | null>(null);
  
  // Real-time Effects Nodes
  const pitchShifterRef = useRef<TimeDomainPitchShifter | null>(null);
  const bassFilterRef = useRef<BiquadFilterNode | null>(null);
  const echoNodeRef = useRef<DelayNode | null>(null);
  const echoGainRef = useRef<GainNode | null>(null);
  const feedbackGainRef = useRef<GainNode | null>(null);
  const reverbGainRef = useRef<GainNode | null>(null);
  const monitorGainRef = useRef<GainNode | null>(null);
  
  const destMergerRef = useRef<MediaStreamAudioDestinationNode | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      stopRecordingGraph();
      if (audioCtxRef.current) {
        audioCtxRef.current.close();
      }
    };
  }, []);

  // Sync real-time sliders with graph
  useEffect(() => {
    if (!audioCtxRef.current) return;
    const t = audioCtxRef.current.currentTime;

    if (pitchShifterRef.current) {
      pitchShifterRef.current.setPitch(pitchShift);
    }

    if (bassFilterRef.current) {
      // low shelf for deep warmth
      bassFilterRef.current.gain.setTargetAtTime(bassBoost * 0.15, t, 0.05); // max +15dB warmth
    }

    if (echoNodeRef.current && feedbackGainRef.current) {
      feedbackGainRef.current.gain.setTargetAtTime(echoFeedback / 140, t, 0.05);
    }

    if (monitorGainRef.current) {
      monitorGainRef.current.gain.setTargetAtTime(monitorVoice ? 0.8 : 0.0, t, 0.05);
    }
  }, [pitchShift, echoFeedback, bassBoost, monitorVoice]);

  const startRecordingGraph = async () => {
    try {
      // Request mic stream
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        } 
      });
      micStreamRef.current = stream;

      // Set up audio context
      if (!audioCtxRef.current) {
        audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      }

      const ctx = audioCtxRef.current;
      if (ctx.state === 'suspended') {
        await ctx.resume();
      }

      // Create nodes
      const micSource = ctx.createMediaStreamSource(stream);
      micSourceNodeRef.current = micSource;

      // 1. Bass Warmth filter (low-shelf)
      const bassFilter = ctx.createBiquadFilter();
      bassFilter.type = 'lowshelf';
      bassFilter.frequency.value = 150;
      bassFilter.gain.value = bassBoost * 0.15;
      bassFilterRef.current = bassFilter;

      // 2. Pitch Shifter
      const pitchShifter = new TimeDomainPitchShifter(ctx);
      pitchShifter.setPitch(pitchShift);
      pitchShifterRef.current = pitchShifter;

      // 3. Echo Node
      const echoNode = ctx.createDelay(1.5);
      echoNode.delayTime.value = 0.35; // 350ms echo
      const feedbackGain = ctx.createGain();
      feedbackGain.gain.value = echoFeedback / 140;
      
      echoNodeRef.current = echoNode;
      feedbackGainRef.current = feedbackGain;

      // Echo routing loop
      pitchShifter.output.connect(echoNode);
      echoNode.connect(feedbackGain);
      feedbackGain.connect(echoNode); // feedback loop

      const echoGain = ctx.createGain();
      echoGain.gain.value = 0.3; // moderate echo wet mix
      echoGainRef.current = echoGain;
      feedbackGain.connect(echoGain);

      // 4. Analyser (VU meter)
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 64;
      analyserRef.current = analyser;

      // 5. Output merger & destination stream
      const destMerger = ctx.createMediaStreamDestination();
      destMergerRef.current = destMerger;

      const mainGain = ctx.createGain();
      mainGain.gain.value = 1.0;

      // Connect source to DSP
      micSource.connect(bassFilter);
      bassFilter.connect(pitchShifter.input);
      
      // Merge dry + wet echo
      pitchShifter.output.connect(mainGain);
      echoGain.connect(mainGain);

      // Connect final master to analyser & offline recorder destination
      mainGain.connect(analyser);
      mainGain.connect(destMerger);

      // Monitoring (listening to voice in headphones)
      const monitorGain = ctx.createGain();
      monitorGain.gain.value = monitorVoice ? 0.8 : 0.0;
      monitorGainRef.current = monitorGain;
      mainGain.connect(monitorGain);
      monitorGain.connect(ctx.destination);

      // Setup recorder
      const mediaRecorder = new MediaRecorder(destMerger.stream);
      mediaRecorderRef.current = mediaRecorder;
      const chunks: Blob[] = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };

      mediaRecorder.onstop = () => {
        const finalBlob = new Blob(chunks, { type: 'audio/webm' });
        const url = URL.createObjectURL(finalBlob);
        setRecordingUrl(url);
        setRecordedChunks(chunks);
      };

      // Start recording
      mediaRecorder.start();
      setIsRecording(true);
      setMicState('recording');
      setRecordingUrl(null);

      // Trigger VU meter
      updateVUMeter();
    } catch (err) {
      console.error(err);
      alert('Could not access microphone. Make sure you gave browser access.');
    }
  };

  const stopRecordingGraph = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop();
    }

    if (micStreamRef.current) {
      micStreamRef.current.getTracks().forEach(track => track.stop());
      micStreamRef.current = null;
    }

    setIsRecording(false);
    setMicState('preview');
    setVolumeLevel(0);

    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }
  };

  const updateVUMeter = () => {
    if (!analyserRef.current || !isRecording) return;
    const array = new Uint8Array(analyserRef.current.frequencyBinCount);
    analyserRef.current.getByteFrequencyData(array);
    
    // Average amplitude
    const average = array.reduce((acc, val) => acc + val, 0) / array.length;
    // Map to 0-100%
    setVolumeLevel(Math.min(100, Math.floor((average / 150) * 100)));
    
    animationFrameRef.current = requestAnimationFrame(updateVUMeter);
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto p-6 bg-[#161412] rounded-3xl border border-[#2d2822] shadow-xl text-left">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 pb-4 border-b border-[#2d2822]">
        <div>
          <h2 className="text-xl font-bold font-sans tracking-tight text-white flex items-center gap-2">
            <Mic className="w-5 h-5 text-red-500 animate-pulse" />
            VOICE RECORDER & EFFECTS STUDIO
          </h2>
          <p className="text-xs text-[#a39785] font-mono">High-quality vocal capture with real-time effects printing</p>
        </div>
        <div className="text-[10px] font-mono tracking-widest bg-red-950/40 text-red-500 px-2.5 py-1 rounded-md border border-red-900">
          STUDIO QUALITY • LIVE FX LOOP
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Left Column: Recording Controls */}
        <div className="bg-[#1b1916] border border-[#2d2822] p-5 rounded-2xl flex flex-col justify-between space-y-6">
          <div className="space-y-4">
            <h3 className="text-xs font-mono text-[#a39785] border-b border-[#2d2822] pb-2 flex items-center gap-1.5">
              <Radio className="w-4 h-4 text-red-500 animate-pulse" />
              RECORDING STATUS
            </h3>

            {/* VU Meter Visualizer */}
            <div className="space-y-2 bg-[#11100e] p-4 rounded-xl border border-[#2d2822]">
              <div className="flex justify-between text-[10px] font-mono text-[#8e816d]">
                <span>Mic Input Gain Meter</span>
                <span>{volumeLevel}%</span>
              </div>
              <div className="w-full bg-[#1e1a16] rounded-full h-3 overflow-hidden border border-[#2d2822] flex space-x-0.5 p-0.5">
                {Array.from({ length: 20 }).map((_, i) => {
                  const barActive = volumeLevel > (i * 5);
                  let colorClass = 'bg-[#2d2822]';
                  if (barActive) {
                    if (i < 13) colorClass = 'bg-emerald-500 shadow-[0_0_6px_#10b981]';
                    else if (i < 17) colorClass = 'bg-amber-500 shadow-[0_0_6px_#f59e0b]';
                    else colorClass = 'bg-red-500 shadow-[0_0_6px_#ef4444]';
                  }
                  return (
                    <div 
                      key={i} 
                      className={`flex-1 rounded-sm transition-all duration-75 ${colorClass}`} 
                    />
                  );
                })}
              </div>
            </div>
          </div>

          <div className="space-y-3">
            {/* Monitor Toggle */}
            <label className="flex items-center justify-between p-3 bg-[#11100e] rounded-xl border border-[#2d2822] cursor-pointer text-xs font-mono">
              <span className="text-[#a39785]">Monitor Mic Loop (Headphones)</span>
              <input
                type="checkbox"
                checked={monitorVoice}
                onChange={(e) => setMonitorVoice(e.target.checked)}
                className="rounded text-amber-500 bg-[#11100e] border-[#2d2822] focus:ring-amber-500 accent-amber-500 w-4 h-4"
              />
            </label>

            {/* Main Record Trigger */}
            {!isRecording ? (
              <button
                onClick={startRecordingGraph}
                className="w-full py-3 bg-red-600 hover:bg-red-500 text-white font-mono text-xs font-bold rounded-xl transition flex items-center justify-center space-x-2 shadow-lg shadow-red-950/20"
              >
                <Mic className="w-4 h-4 fill-current" />
                <span>START RECORDING</span>
              </button>
            ) : (
              <button
                onClick={stopRecordingGraph}
                className="w-full py-3 bg-[#2d221d] border border-red-500/40 text-red-500 font-mono text-xs font-bold rounded-xl hover:bg-[#3d2b24] transition flex items-center justify-center space-x-2 animate-pulse"
              >
                <Square className="w-4 h-4 fill-current" />
                <span>STOP RECORDING</span>
              </button>
            )}
          </div>
        </div>

        {/* Right Column: Live FX Rack */}
        <div className="md:col-span-2 bg-[#1b1916] border border-[#2d2822] p-5 rounded-2xl flex flex-col justify-between space-y-6">
          <div className="space-y-4">
            <h3 className="text-xs font-mono text-[#a39785] border-b border-[#2d2822] pb-2 flex items-center gap-1.5">
              <Sliders className="w-4 h-4 text-red-500" />
              LIVE PRINTED EFFECTS RACK
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Effect 1: Pitch Shifter */}
              <div className="space-y-2 bg-[#11100e] p-3 rounded-xl border border-[#2d2822]/60">
                <div className="flex justify-between text-[11px] font-mono">
                  <span className="text-[#8e816d]">Vocal Pitch Shift</span>
                  <span className="text-red-500 font-bold">{pitchShift > 0 ? `+${pitchShift}` : pitchShift} semitones</span>
                </div>
                <input
                  type="range"
                  min="-12"
                  max="12"
                  value={pitchShift}
                  onChange={(e) => setPitchShift(parseInt(e.target.value))}
                  className="w-full accent-red-500 bg-[#1e1a16] rounded-lg h-1 appearance-none cursor-pointer"
                />
              </div>

              {/* Effect 2: Echo Feedback */}
              <div className="space-y-2 bg-[#11100e] p-3 rounded-xl border border-[#2d2822]/60">
                <div className="flex justify-between text-[11px] font-mono">
                  <span className="text-[#8e816d]">Eco Feedback Loop</span>
                  <span className="text-red-500 font-bold">{echoFeedback}%</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={echoFeedback}
                  onChange={(e) => setEchoFeedback(parseInt(e.target.value))}
                  className="w-full accent-red-500 bg-[#1e1a16] rounded-lg h-1 appearance-none cursor-pointer"
                />
              </div>

              {/* Effect 3: Bass Presence Warmth */}
              <div className="space-y-2 bg-[#11100e] p-3 rounded-xl border border-[#2d2822]/60">
                <div className="flex justify-between text-[11px] font-mono">
                  <span className="text-[#8e816d]">Warmth / Bass Boost</span>
                  <span className="text-red-500 font-bold">{bassBoost}%</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={bassBoost}
                  onChange={(e) => setBassBoost(parseInt(e.target.value))}
                  className="w-full accent-red-500 bg-[#1e1a16] rounded-lg h-1 appearance-none cursor-pointer"
                />
              </div>

              {/* Tips block */}
              <div className="p-3 bg-red-950/10 rounded-xl border border-red-900/20 flex flex-col justify-center">
                <p className="text-[10px] text-[#8e816d] leading-normal font-mono">
                  ★ <strong className="text-red-400">Headphones Recommended:</strong> Wear headphones to prevent feedback howling when voice monitoring is toggled active.
                </p>
              </div>
            </div>
          </div>

          {/* Download segment */}
          {recordingUrl && (
            <div className="flex justify-between items-center bg-[#11100e] p-3.5 rounded-xl border border-[#2d2822] animate-fade-in">
              <div className="flex items-center space-x-3">
                <div className="p-2 bg-red-500/10 text-red-500 rounded-lg">
                  <Mic className="w-4 h-4" />
                </div>
                <div>
                  <p className="text-xs font-bold text-white">Vocal Recording Complete</p>
                  <p className="text-[10px] text-[#8e816d] font-mono">Saved with active real-time effects</p>
                </div>
              </div>

              <div className="flex items-center space-x-2">
                <audio src={recordingUrl} controls className="h-8 max-w-40 sm:max-w-none accent-red-500" />
                <a
                  href={recordingUrl}
                  download={`vocal_recording_${Date.now().toString().substring(6)}.wav`}
                  className="px-4 py-2 bg-emerald-600 text-white font-mono text-xs font-bold rounded-lg hover:bg-emerald-500 transition flex items-center space-x-1.5"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>SAVE WAV</span>
                </a>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
