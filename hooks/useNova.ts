import { useState, useRef, useCallback, useEffect } from 'react';
import { GoogleGenAI, LiveServerMessage, Modality, FunctionDeclaration, Type, LiveSession } from '@google/genai';
import { NovaStatus, LogEntry } from '../types';
import { decode, decodeAudioData, createBlob, downsampleTo16k, PCM_SAMPLE_RATE_INPUT, PCM_SAMPLE_RATE_OUTPUT } from '../services/audioUtils';

// Function Declarations
const openUrlFunction: FunctionDeclaration = {
  name: 'openUrl',
  parameters: {
    type: Type.OBJECT,
    description: 'Open a specific URL in a new tab. Use this for "Open [website]", "Type in [website]", "Play [media]", "Open Compiler", etc.',
    properties: {
      url: { type: Type.STRING, description: 'The URL or website name (e.g., "youtube.com", "face book . com", "reddit")' },
    },
    required: ['url'],
  },
};

const googleSearchFunction: FunctionDeclaration = {
  name: 'googleSearch',
  parameters: {
    type: Type.OBJECT,
    description: 'Search Google for information, news, or when the user asks to "search for" something.',
    properties: {
      query: { type: Type.STRING, description: 'The search query' },
    },
    required: ['query'],
  },
};

const changeThemeFunction: FunctionDeclaration = {
  name: 'changeTheme',
  parameters: {
    type: Type.OBJECT,
    description: 'Change the visual theme of the application.',
    properties: {
      mode: { type: Type.STRING, enum: ['light', 'dark', 'cyberpunk'], description: 'The theme mode to switch to.' },
    },
    required: ['mode'],
  },
};

const getSystemStatusFunction: FunctionDeclaration = {
  name: 'getSystemStatus',
  parameters: {
    type: Type.OBJECT,
    description: 'Get current system status including time, platform, and battery (if available).',
    properties: {},
  },
};

// Default wake word configuration
const WAKE_WORD = 'porcupine';

export const useNova = () => {
  const [status, setStatus] = useState<NovaStatus>(NovaStatus.IDLE);
  const [inputAnalyser, setInputAnalyser] = useState<AnalyserNode | null>(null);
  const [outputAnalyser, setOutputAnalyser] = useState<AnalyserNode | null>(null);
  const [currentTheme, setCurrentTheme] = useState('dark');
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [isWakeWordListening, setIsWakeWordListening] = useState(false);
  
  // Screen Sharing State
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [screenStream, setScreenStream] = useState<MediaStream | null>(null);

  // Refs for audio management
  const inputAudioContextRef = useRef<AudioContext | null>(null);
  const outputAudioContextRef = useRef<AudioContext | null>(null);
  const inputSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const nextStartTimeRef = useRef<number>(0);
  const sourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  
  // Buffering Refs
  const audioBufferRef = useRef<Float32Array>(new Float32Array(0));
  const BUFFER_THRESHOLD = 4096;
  
  // Video/Screen Refs
  const videoIntervalRef = useRef<number | null>(null);
  const videoCanvasRef = useRef<HTMLCanvasElement | null>(null);
  
  // API Refs
  const sessionRef = useRef<LiveSession | null>(null);
  const stopRef = useRef<boolean>(false);
  const isConnectingRef = useRef<boolean>(false);
  const retryCountRef = useRef<number>(0);
  
  // Porcupine Refs
  const porcupineRef = useRef<any>(null);

  const addLog = useCallback((message: string, type: LogEntry['type'] = 'info', source: LogEntry['source'] = 'system', link?: string) => {
    const entry: LogEntry = {
      id: Math.random().toString(36).substring(7),
      timestamp: new Date().toLocaleTimeString(),
      source,
      message,
      type,
      link
    };
    setLogs(prev => [...prev, entry]);
  }, []);

  const stopScreenShare = useCallback(() => {
    if (videoIntervalRef.current) {
        window.clearInterval(videoIntervalRef.current);
        videoIntervalRef.current = null;
    }
    if (screenStream) {
        screenStream.getTracks().forEach(track => track.stop());
        setScreenStream(null);
    }
    setIsScreenSharing(false);
    addLog('Screen sharing ended', 'info', 'system');
  }, [screenStream, addLog]);

  const startScreenShare = useCallback(async () => {
    try {
        const stream = await navigator.mediaDevices.getDisplayMedia({
            video: {
                width: { max: 1280 },
                height: { max: 720 },
                frameRate: { max: 10 }
            },
            audio: false 
        });

        setScreenStream(stream);
        setIsScreenSharing(true);
        addLog('Screen sharing active', 'info', 'system');

        // Setup hidden video element for capture
        const videoEl = document.createElement('video');
        videoEl.srcObject = stream;
        videoEl.muted = true;
        videoEl.play();

        if (!videoCanvasRef.current) {
            videoCanvasRef.current = document.createElement('canvas');
            videoCanvasRef.current.width = 640; // Downscale for efficiency
            videoCanvasRef.current.height = 360;
        }

        // Start capture loop (1 FPS is enough for code/screen reading)
        videoIntervalRef.current = window.setInterval(() => {
            if (!sessionRef.current) return;

            const canvas = videoCanvasRef.current!;
            const ctx = canvas.getContext('2d')!;
            
            // Draw frame
            ctx.drawImage(videoEl, 0, 0, canvas.width, canvas.height);
            
            // Convert to base64
            const base64 = canvas.toDataURL('image/jpeg', 0.5).split(',')[1];
            
            sessionRef.current.sendRealtimeInput({
                media: {
                    mimeType: 'image/jpeg',
                    data: base64
                }
            });
        }, 1000);

        // Handle user stopping via browser UI
        stream.getVideoTracks()[0].onended = () => {
            stopScreenShare();
        };

    } catch (e: any) {
        const msg = e.name === 'NotAllowedError' 
            ? 'Permission denied. Please allow screen access.' 
            : e.message;
        addLog(`Screen share failed: ${msg}`, 'error', 'system');
        setIsScreenSharing(false);
    }
  }, [addLog, stopScreenShare]);

  const cleanupAudio = useCallback(() => {
    if (processorRef.current) {
      processorRef.current.disconnect();
      processorRef.current = null;
    }
    if (inputSourceRef.current) {
      inputSourceRef.current.disconnect();
      inputSourceRef.current = null;
    }
    if (inputAudioContextRef.current) {
      inputAudioContextRef.current.close();
      inputAudioContextRef.current = null;
    }
    if (outputAudioContextRef.current) {
      outputAudioContextRef.current.close();
      outputAudioContextRef.current = null;
    }
    
    sourcesRef.current.forEach(source => {
        try { source.stop(); } catch(e) {}
    });
    sourcesRef.current.clear();
    
    setInputAnalyser(null);
    setOutputAnalyser(null);
    audioBufferRef.current = new Float32Array(0);
  }, []);

  const disconnect = useCallback(async () => {
    stopRef.current = true;
    sessionRef.current = null;
    isConnectingRef.current = false;
    retryCountRef.current = 0;
    
    stopScreenShare();
    cleanupAudio();
    
    setStatus(NovaStatus.IDLE);
    addLog('Session disconnected by user', 'info', 'system');
    
    setTimeout(() => {
        startWakeWord();
    }, 1000);
  }, [cleanupAudio, addLog, stopScreenShare]);

  const stopWakeWord = useCallback(async () => {
    if (porcupineRef.current) {
        try {
            const { WebVoiceProcessor } = await import('@picovoice/web-voice-processor');
            await WebVoiceProcessor.unsubscribe(porcupineRef.current);
            porcupineRef.current.terminate();
            porcupineRef.current = null;
            setIsWakeWordListening(false);
        } catch (e) {
            console.error("Error stopping wake word:", e);
        }
    }
  }, []);

  const startWakeWord = useCallback(async () => {
    let accessKey = '';
    try {
        if (typeof process !== 'undefined' && process.env && process.env.PICOVOICE_ACCESS_KEY) {
            accessKey = process.env.PICOVOICE_ACCESS_KEY;
        }
    } catch (e) {}

    if (!accessKey) return;
    if (sessionRef.current || isConnectingRef.current) return;
    
    try {
        await stopWakeWord();

        const { PorcupineWorker } = await import('@picovoice/porcupine-web');
        const { WebVoiceProcessor } = await import('@picovoice/web-voice-processor');

        const keywordModel = {
            publicPath: `https://cdn.jsdelivr.net/gh/Picovoice/porcupine@master/resources/keyword_files_wasm/${WAKE_WORD}_wasm.ppn`,
            label: WAKE_WORD
        };
        const model = {
             publicPath: 'https://cdn.jsdelivr.net/gh/Picovoice/porcupine@master/lib/common/porcupine_params.pv'
        };

        porcupineRef.current = await PorcupineWorker.create(
            accessKey,
            keywordModel,
            model
        );
        
        porcupineRef.current.onmessage = (msg: any) => {
            if (msg.data.command === 'ppn-keyword') {
                addLog(`Wake Word '${WAKE_WORD}' detected!`, 'info', 'system');
                stopWakeWord().then(() => {
                     const apiKey = typeof process !== 'undefined' ? process.env.API_KEY : '';
                     connect(apiKey || '');
                });
            }
        };

        await WebVoiceProcessor.subscribe(porcupineRef.current);
        setIsWakeWordListening(true);
        addLog(`Wake word engine active. Say '${WAKE_WORD}'...`, 'info', 'system');
    } catch (err: any) {
        console.error(err);
        addLog(`Wake word init failed: ${err.message || 'Unknown error'}`, 'error', 'system');
    }
  }, [addLog, stopWakeWord]);

  const sendTextMessage = useCallback((text: string) => {
    if (!sessionRef.current) {
        addLog("Connect to Nova first to send commands.", 'error', 'system');
        return;
    }
    try {
        // Send text as user content to the model
        sessionRef.current.sendRealtimeInput({
            content: [{ parts: [{ text }] }]
        });
        addLog(`Command: ${text}`, 'info', 'user');
    } catch (e: any) {
        addLog(`Error sending command: ${e.message}`, 'error', 'system');
    }
  }, [addLog]);

  const connect = useCallback(async (apiKey: string) => {
    if (!apiKey) {
      addLog('API Key missing', 'error', 'system');
      setStatus(NovaStatus.ERROR);
      return;
    }

    if (isConnectingRef.current) return;

    await stopWakeWord();

    try {
      isConnectingRef.current = true;
      setStatus(NovaStatus.CONNECTING);
      stopRef.current = false;
      addLog(retryCountRef.current > 0 ? 'Reconnecting to Nova core...' : 'Initializing Nova core systems...', 'info', 'system');

      const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
      const inputCtx = new AudioContext({ sampleRate: PCM_SAMPLE_RATE_INPUT });
      const outputCtx = new AudioContext({ sampleRate: PCM_SAMPLE_RATE_OUTPUT });
      
      await inputCtx.resume();
      await outputCtx.resume();
      
      if (retryCountRef.current === 0) {
        addLog('Audio pipeline initialized', 'info', 'system');
      }

      inputAudioContextRef.current = inputCtx;
      outputAudioContextRef.current = outputCtx;

      const inAnalyser = inputCtx.createAnalyser();
      inAnalyser.fftSize = 256;
      inAnalyser.smoothingTimeConstant = 0.5;
      setInputAnalyser(inAnalyser);

      const outAnalyser = outputCtx.createAnalyser();
      outAnalyser.fftSize = 256;
      outAnalyser.smoothingTimeConstant = 0.5;
      setOutputAnalyser(outAnalyser);
      
      const outputGain = outputCtx.createGain();
      outputGain.connect(outAnalyser);
      outAnalyser.connect(outputCtx.destination);

      const ai = new GoogleGenAI({ apiKey });
      
      const config = {
        model: 'gemini-2.5-flash-native-audio-preview-09-2025',
        callbacks: {
          onopen: async () => {
            addLog('Secure connection established', 'info', 'system');
            setStatus(NovaStatus.LISTENING);
            isConnectingRef.current = false;
            retryCountRef.current = 0;
            
            try {
              const stream = await navigator.mediaDevices.getUserMedia({ 
                audio: {
                  channelCount: 1,
                  sampleRate: PCM_SAMPLE_RATE_INPUT,
                  echoCancellation: true,
                  noiseSuppression: true,
                  autoGainControl: true
                } 
              });
              
              if (retryCountRef.current === 0) {
                addLog('Microphone access granted', 'info', 'system');
              }
              const source = inputCtx.createMediaStreamSource(stream);
              inputSourceRef.current = source;
              
              let scriptBufferSize = 2048; 
              if (inputCtx.sampleRate >= 44100) scriptBufferSize = 4096;
              if (inputCtx.sampleRate >= 96000) scriptBufferSize = 8192;
              
              const processor = inputCtx.createScriptProcessor(scriptBufferSize, 1, 1);
              processorRef.current = processor;
              
              source.connect(inAnalyser);
              inAnalyser.connect(processor);
              
              const muteGain = inputCtx.createGain();
              muteGain.gain.value = 0;
              processor.connect(muteGain);
              muteGain.connect(inputCtx.destination);

              processor.onaudioprocess = (e) => {
                if (stopRef.current) return;
                const inputData = e.inputBuffer.getChannelData(0);
                const downsampledData = downsampleTo16k(inputData, inputCtx.sampleRate);
                
                const newBuffer = new Float32Array(audioBufferRef.current.length + downsampledData.length);
                newBuffer.set(audioBufferRef.current);
                newBuffer.set(downsampledData, audioBufferRef.current.length);
                audioBufferRef.current = newBuffer;

                if (audioBufferRef.current.length >= BUFFER_THRESHOLD) {
                    const chunkToSend = audioBufferRef.current.slice(0, BUFFER_THRESHOLD);
                    audioBufferRef.current = audioBufferRef.current.slice(BUFFER_THRESHOLD);
                    
                    let sumSquares = 0;
                    for(let i=0; i<chunkToSend.length; i++) {
                        sumSquares += chunkToSend[i] * chunkToSend[i];
                    }
                    const rms = Math.sqrt(sumSquares / chunkToSend.length);
                    
                    if (rms > 0.000001) {
                        const pcmBlob = createBlob(chunkToSend);
                        sessionPromise.then((session) => {
                            try {
                                session.sendRealtimeInput({ media: pcmBlob });
                            } catch (e) {}
                        }).catch(() => {});
                    }
                }
              };
            } catch (micErr: any) {
              addLog(`Microphone Error: ${micErr.message}`, 'error', 'system');
              setStatus(NovaStatus.ERROR);
            }
          },
          onmessage: async (message: LiveServerMessage) => {
            if (stopRef.current) return;

            const base64Audio = message.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
            if (base64Audio) {
               setStatus(NovaStatus.SPEAKING);
               try {
                 const audioBuffer = await decodeAudioData(
                   decode(base64Audio), 
                   outputCtx, 
                   PCM_SAMPLE_RATE_OUTPUT, 
                   1
                 );
                 
                 const source = outputCtx.createBufferSource();
                 source.buffer = audioBuffer;
                 source.connect(outputGain);
                 
                 const currentTime = outputCtx.currentTime;
                 if (nextStartTimeRef.current < currentTime) {
                   nextStartTimeRef.current = currentTime;
                 }
                 
                 source.start(nextStartTimeRef.current);
                 nextStartTimeRef.current += audioBuffer.duration;
                 
                 sourcesRef.current.add(source);
                 source.onended = () => {
                   sourcesRef.current.delete(source);
                   if (sourcesRef.current.size === 0) {
                      setStatus(NovaStatus.LISTENING);
                   }
                 };
               } catch (audioErr) {
                 addLog('Audio playback error', 'error', 'system');
               }
            }

            const inputTranscript = message.serverContent?.inputTranscription?.text;
            if (inputTranscript) {
                addLog(`You: ${inputTranscript}`, 'info', 'user');
            }

            if (message.serverContent?.turnComplete) {
               setStatus(NovaStatus.LISTENING);
            }

            if (message.toolCall) {
              const functionResponses = [];
              for (const fc of message.toolCall.functionCalls) {
                const { name, args, id } = fc;
                let result: any = { success: true };
                addLog(`Executing tool: ${name}`, 'tool', 'system');

                try {
                    if (name === 'openUrl') {
                        let url = (args as any).url as string;
                        // Robust URL cleaning
                        // 1. Lowercase
                        url = url.toLowerCase();
                        // 2. Strip all spaces (e.g., "face book . com")
                        url = url.replace(/\s+/g, '');
                        
                        // 3. Heuristic for protocol
                        if (!url.startsWith('http://') && !url.startsWith('https://')) {
                            url = 'https://' + url;
                        }

                        // 4. Heuristic for extension (e.g., "reddit" -> "reddit.com")
                        // Try parsing to check hostname
                        try {
                            const urlObj = new URL(url);
                            if (!urlObj.hostname.includes('.')) {
                                urlObj.hostname += '.com';
                                url = urlObj.toString();
                            }
                        } catch (e) {
                            // If URL parse failed, fallback to simple check
                            if (!url.includes('.')) {
                                url += '.com';
                            }
                        }
                        
                        const win = window.open(url, '_blank');
                        
                        if (win) {
                            result = { opened: true, url };
                            addLog(`Opened URL: ${url}`, 'tool', 'system', url);
                        } else {
                            result = { opened: false, error: 'Popup blocked' };
                            addLog(`Popup blocked. Click here to open: ${url}`, 'error', 'system', url);
                        }
                    } else if (name === 'googleSearch') {
                        const query = (args as any).query;
                        const url = `https://www.google.com/search?q=${encodeURIComponent(query)}`;
                        const win = window.open(url, '_blank');
                        if (win) {
                            result = { searched: true, query };
                            addLog(`Searching Google: ${query}`, 'tool', 'system', url);
                        } else {
                            result = { error: 'Popup blocked' };
                            addLog(`Popup blocked. Search link: ${query}`, 'error', 'system', url);
                        }
                    } else if (name === 'changeTheme') {
                        const mode = (args as any).mode;
                        setCurrentTheme(mode);
                        result = { themeChangedTo: mode };
                        addLog(`Theme changed to ${mode}`, 'tool', 'system');
                    } else if (name === 'getSystemStatus') {
                        result = {
                            time: new Date().toISOString(),
                            userAgent: navigator.userAgent,
                            onLine: navigator.onLine
                        };
                        addLog('System diagnostics run', 'tool', 'system');
                    }
                } catch (toolErr: any) {
                    result = { error: toolErr.message };
                    addLog(`Tool error: ${toolErr.message}`, 'error', 'system');
                }
                
                functionResponses.push({ id, name, response: { result } });
              }
              
              sessionPromise.then((session) => {
                try {
                    session.sendToolResponse({ functionResponses });
                } catch (e) {
                    console.error('Failed to send tool response', e);
                }
              });
            }
          },
          onclose: () => {
             addLog('Connection closed by server', 'info', 'system');
             setStatus(NovaStatus.IDLE);
             isConnectingRef.current = false;
             stopRef.current = true;
             stopScreenShare();
             setTimeout(() => startWakeWord(), 1000);
          },
          onerror: (err) => {
             const msg = (err as any).message || 'Unknown error';
             if (!msg.includes('closed')) {
                 addLog(`Connection Error: ${msg}`, 'error', 'system');
             }
             setStatus(NovaStatus.ERROR);
             isConnectingRef.current = false;
             
             if (msg.includes('Network error') && retryCountRef.current === 0) {
                 retryCountRef.current++;
                 addLog('Attempting auto-reconnect in 2s...', 'info', 'system');
                 cleanupAudio();
                 setTimeout(() => connect(apiKey), 2000);
             }
          }
        },
        config: {
            responseModalities: [Modality.AUDIO],
            inputAudioTranscription: {},
            speechConfig: {
              voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Puck' } }
            },
            systemInstruction: `You are Nova, a superior AI assistant.
            
            CORE CAPABILITIES:
            1. BROWSE & PLAY: 
               - If asked to "Play [song/video]", use 'openUrl' with: https://www.youtube.com/results?search_query=[query]
               - If asked to "Open [website]" or "Type in [website]", use 'openUrl'.
               - "Type in [x]" usually means "Open [x].com".
               - If asked for "C Compiler" or "Coding", use 'openUrl' with: https://www.onlinegdb.com/online_c_compiler
            
            2. VISION & SUMMARIZATION:
               - You can SEE the screen via the video stream. 
               - If asked to "Summarize this page", "Explain this code", or "What is on my screen?", ANALYZE the video input.
               - If you cannot see the screen clearly, politely ask the user to "Share Screen".
            
            3. SEARCH & KNOWLEDGE:
               - If asked to "Search for X", use 'googleSearch'.
            
            4. TEXT COMMANDS:
               - Users may TYPE commands. Treat them with high priority.
               - "Type in google" -> openUrl(google.com)
            
            PERSONALITY:
            - Efficient, professional, and helpful. 
            - Always confirm actions verbally (e.g., "Opening YouTube...", "Analyzing screen...").
            `,
            tools: [
                { functionDeclarations: [openUrlFunction, googleSearchFunction, changeThemeFunction, getSystemStatusFunction] }
            ]
        }
      };

      const sessionPromise = ai.live.connect(config);
      const session = await sessionPromise;
      sessionRef.current = session;
      
    } catch (error: any) {
      addLog(`Initialization failed: ${error.message}`, 'error', 'system');
      setStatus(NovaStatus.ERROR);
      isConnectingRef.current = false;
    }
  }, [cleanupAudio, addLog, startWakeWord, stopWakeWord]);

  useEffect(() => {
    let keyExists = false;
    try {
        if (typeof process !== 'undefined' && process.env && process.env.PICOVOICE_ACCESS_KEY) {
            keyExists = true;
        }
    } catch (e) {}

    if (status === NovaStatus.IDLE && !isWakeWordListening && keyExists) {
        startWakeWord();
    }
    return () => {
        stopWakeWord();
    };
  }, []);

  return {
    connect,
    disconnect,
    status,
    inputAnalyser,
    outputAnalyser,
    currentTheme,
    logs,
    isWakeWordListening,
    startWakeWord,
    stopWakeWord,
    startScreenShare,
    stopScreenShare,
    isScreenSharing,
    screenStream,
    sendTextMessage
  };
};