import React, { useState, useEffect, useRef } from 'react';
import { useNova } from './hooks/useNova';
import Visualizer from './components/Visualizer';
import Console from './components/Console';
import { Power, Settings, ShieldCheck, Activity, Command, Ear, Monitor, X, Send, Info, Mic, AppWindow, Search, Clock, Puzzle, Smartphone, Lock } from 'lucide-react';
import { NovaStatus } from './types';

// Safe check for API Key
const HAS_API_KEY = typeof process !== 'undefined' && process.env && !!process.env.API_KEY;
const API_KEY = typeof process !== 'undefined' && process.env ? process.env.API_KEY : '';

function App() {
  const { 
    connect, 
    disconnect, 
    status, 
    inputAnalyser, 
    outputAnalyser,
    currentTheme,
    logs,
    isWakeWordListening,
    isScreenSharing,
    startScreenShare,
    stopScreenShare,
    screenStream,
    sendTextMessage
  } = useNova();

  const [textInput, setTextInput] = useState('');
  const [showFeatures, setShowFeatures] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  // Attach screen stream to video element when available
  useEffect(() => {
    if (videoRef.current && screenStream) {
        videoRef.current.srcObject = screenStream;
    }
  }, [screenStream]);

  const handleToggle = () => {
    if (status === NovaStatus.IDLE || status === NovaStatus.ERROR) {
      connect(API_KEY || '');
    } else {
      disconnect();
    }
  };

  const handleSend = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!textInput.trim()) return;
    sendTextMessage(textInput);
    setTextInput('');
  };

  // Apply theme effect
  useEffect(() => {
    const root = document.documentElement;
    if (currentTheme === 'light') {
        root.style.setProperty('--bg-color', '#f8fafc');
        root.style.setProperty('--text-color', '#0f172a');
    } else {
        root.style.setProperty('--bg-color', '#030712');
        root.style.setProperty('--text-color', '#e2e8f0');
    }
  }, [currentTheme]);

  const getStatusText = (s: NovaStatus) => {
    switch (s) {
        case NovaStatus.IDLE: return isWakeWordListening ? 'WAITING FOR WAKE WORD' : 'SYSTEM STANDBY';
        case NovaStatus.CONNECTING: return 'INITIALIZING UPLINK...';
        case NovaStatus.LISTENING: return 'LISTENING...';
        case NovaStatus.THINKING: return 'PROCESSING...';
        case NovaStatus.SPEAKING: return 'NOVA ACTIVE';
        case NovaStatus.ERROR: return 'SYSTEM ERROR';
        default: return 'UNKNOWN STATE';
    }
  };

  return (
    <div className={`min-h-screen w-full flex flex-col relative overflow-hidden transition-colors duration-500 ${
        currentTheme === 'light' ? 'bg-slate-50 text-slate-900' : 'bg-void text-nova-50'
    }`}>
      {/* Background Gradients */}
      <div className="absolute inset-0 pointer-events-none">
         <div className="absolute top-[-10%] left-[-10%] w-[500px] h-[500px] bg-nova-900/20 rounded-full blur-[100px]"></div>
         <div className="absolute bottom-[-10%] right-[-10%] w-[500px] h-[500px] bg-purple-900/20 rounded-full blur-[100px]"></div>
      </div>

      {/* Features Modal */}
      {showFeatures && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
            <div className="bg-slate-900 border border-slate-700 rounded-2xl p-8 max-w-5xl w-full shadow-2xl relative overflow-y-auto max-h-[90vh]">
                <button onClick={() => setShowFeatures(false)} className="absolute top-4 right-4 p-2 text-slate-400 hover:text-white transition-colors rounded-full hover:bg-slate-800">
                    <X className="w-6 h-6" />
                </button>
                
                <div className="flex items-center gap-3 mb-8">
                    <div className="w-10 h-10 rounded bg-gradient-to-br from-nova-500 to-purple-600 flex items-center justify-center shadow-lg">
                        <Activity className="w-6 h-6 text-white" />
                    </div>
                    <div>
                        <h2 className="text-2xl font-bold text-white">Nova Capabilities</h2>
                        <p className="text-nova-400 text-sm font-mono">SYSTEM MODULES v2.5</p>
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    <FeatureCard 
                        icon={<Mic className="text-blue-400" />} 
                        title="Voice Commands" 
                        desc="Natural language processing for smooth, conversational interaction." 
                    />
                    <FeatureCard 
                        icon={<AppWindow className="text-purple-400" />} 
                        title="App Automation" 
                        desc="Open apps, toggle settings, and launch system tools." 
                    />
                    <FeatureCard 
                        icon={<Search className="text-emerald-400" />} 
                        title="Smart Search" 
                        desc="Search the web, find files, and retrieve information instantly." 
                    />
                    <FeatureCard 
                        icon={<Clock className="text-amber-400" />} 
                        title="Reminders & Tasks" 
                        desc="Set alarms, reminders, notes, and to-dos." 
                    />
                    <FeatureCard 
                        icon={<Puzzle className="text-pink-400" />} 
                        title="Modular Design" 
                        desc="Add new skills or abilities with simple plugin modules." 
                    />
                    <FeatureCard 
                        icon={<Smartphone className="text-indigo-400" />} 
                        title="Cross-Platform" 
                        desc="Built to adapt to mobile, desktop, or web environments." 
                    />
                    <FeatureCard 
                        icon={<Lock className="text-red-400" />} 
                        title="Privacy-Friendly" 
                        desc="Runs locally where possible with optional cloud integrations." 
                    />
                    <FeatureCard 
                        icon={<Monitor className="text-cyan-400" />} 
                        title="Visual Intelligence" 
                        desc="Real-time screen analysis and context awareness." 
                    />
                </div>
            </div>
        </div>
      )}

      {/* Header */}
      <header className="relative z-10 px-6 py-4 flex items-center justify-between border-b border-slate-800/50 backdrop-blur-md">
        <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded bg-gradient-to-br from-nova-500 to-purple-600 flex items-center justify-center shadow-lg shadow-nova-500/20">
                <Activity className="w-5 h-5 text-white" />
            </div>
            <h1 className="text-xl font-sans font-bold tracking-tight">NOVA <span className="text-xs font-mono text-nova-400 ml-1 opacity-70">v2.5.PROD</span></h1>
        </div>
        <div className="flex items-center gap-4">
             {isWakeWordListening && status === NovaStatus.IDLE && (
                 <div className="flex items-center gap-2 px-3 py-1 rounded-full text-xs font-mono border border-amber-500/30 bg-amber-900/10 text-amber-400 animate-pulse hidden md:flex">
                    <Ear className="w-3 h-3" />
                    LISTENING FOR "PORCUPINE"
                 </div>
             )}
             <div className={`flex items-center gap-2 px-3 py-1 rounded-full text-xs font-mono border ${
                 status === NovaStatus.IDLE ? 'border-slate-700 text-slate-500' : 
                 status === NovaStatus.ERROR ? 'border-red-900 bg-red-900/20 text-red-400' :
                 'border-nova-500/50 bg-nova-900/20 text-nova-400'
             }`}>
                <div className={`w-2 h-2 rounded-full ${
                    status === NovaStatus.IDLE ? 'bg-slate-500' :
                    status === NovaStatus.ERROR ? 'bg-red-500' :
                    'bg-nova-400 animate-pulse'
                }`}></div>
                {status}
             </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="relative z-10 flex-1 p-6 gap-6 grid grid-cols-1 lg:grid-cols-12 h-[calc(100vh-80px)] overflow-hidden">
        
        {/* Left Column: Visualizer & Status */}
        <div className="lg:col-span-7 flex flex-col gap-6">
            <div className="flex-1 bg-slate-900/30 border border-slate-800/50 rounded-3xl flex flex-col items-center justify-center relative overflow-hidden group backdrop-blur-sm shadow-2xl">
                <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/dark-matter.png')] opacity-20"></div>
                
                {/* Screen Share Preview */}
                {isScreenSharing && (
                    <div className="absolute top-4 right-4 w-48 aspect-video bg-black rounded border border-slate-700 overflow-hidden shadow-lg z-20 animate-in fade-in slide-in-from-top-4">
                         <video 
                            ref={videoRef} 
                            autoPlay 
                            playsInline 
                            muted 
                            className="w-full h-full object-cover" 
                         />
                         <div className="absolute bottom-0 left-0 right-0 bg-red-900/80 text-white text-[10px] font-bold text-center py-0.5">
                            LIVE STREAM
                         </div>
                    </div>
                )}

                <Visualizer 
                    inputAnalyser={inputAnalyser} 
                    outputAnalyser={outputAnalyser} 
                    status={status} 
                />
                
                <div className="absolute bottom-8 text-center w-full px-4">
                    <h2 className={`text-2xl md:text-3xl font-light tracking-widest mb-3 transition-colors duration-300 ${
                        status === NovaStatus.ERROR ? 'text-red-400' : 'text-slate-200'
                    }`}>
                        {getStatusText(status)}
                    </h2>
                    <p className="text-xs font-mono text-slate-500 uppercase tracking-[0.3em]">
                        {status === NovaStatus.IDLE && isWakeWordListening ? "Say 'Porcupine' to activate" :
                         status === NovaStatus.IDLE ? 'Secure Link Required' : 
                         status === NovaStatus.ERROR ? 'Check Connection' : 'Voice Interface Active'}
                    </p>
                </div>
            </div>

            {/* Control Bar */}
            <div className="flex flex-col gap-4 bg-slate-900/60 border border-slate-800/50 rounded-2xl p-6 backdrop-blur-md shadow-xl">
                <div className="flex items-center justify-between">
                    {!HAS_API_KEY ? (
                        <div className="text-red-400 font-mono text-sm flex items-center gap-2">
                            <ShieldCheck className="w-4 h-4" />
                            API Key Missing
                        </div>
                    ) : (
                        <div className="flex items-center gap-4">
                            <button 
                                onClick={handleToggle}
                                className={`h-12 px-8 rounded-full font-bold tracking-wide transition-all duration-300 flex items-center gap-3 shadow-lg transform active:scale-95 ${
                                    status === NovaStatus.IDLE || status === NovaStatus.ERROR 
                                    ? 'bg-gradient-to-r from-nova-600 to-nova-500 hover:from-nova-500 hover:to-nova-400 text-white shadow-nova-500/25' 
                                    : 'bg-red-500/10 border border-red-500/50 text-red-400 hover:bg-red-500/20'
                                }`}
                            >
                                {status === NovaStatus.IDLE || status === NovaStatus.ERROR ? (
                                    <>
                                        <Power className="w-5 h-5" />
                                        INITIALIZE
                                    </>
                                ) : (
                                    <>
                                        <Power className="w-5 h-5" />
                                        TERMINATE
                                    </>
                                )}
                            </button>
                        </div>
                    )}

                    <div className="flex gap-3">
                        <button 
                            onClick={() => setShowFeatures(true)}
                            className="p-3 rounded-full bg-slate-800/50 hover:bg-slate-700 text-slate-400 hover:text-nova-400 transition-all"
                            title="Capabilities"
                        >
                            <Info className="w-5 h-5" />
                        </button>

                        {/* Screen Share Toggle */}
                        <button 
                            onClick={isScreenSharing ? stopScreenShare : startScreenShare}
                            className={`p-3 rounded-full transition-all flex items-center gap-2 ${
                                isScreenSharing 
                                ? 'bg-red-500/20 text-red-400 border border-red-500/50 hover:bg-red-500/30' 
                                : 'bg-slate-800/50 text-slate-400 hover:bg-slate-700 hover:text-nova-400'
                            }`}
                            title={isScreenSharing ? "Stop Screen Sharing" : "Share Screen"}
                        >
                            {isScreenSharing ? <X className="w-5 h-5" /> : <Monitor className="w-5 h-5" />}
                        </button>
                        
                        <button className="p-3 rounded-full bg-slate-800/50 hover:bg-slate-700 text-slate-400 hover:text-nova-400 transition-all">
                            <Settings className="w-5 h-5" />
                        </button>
                    </div>
                </div>
                
                {/* Command Input */}
                <form onSubmit={handleSend} className="relative">
                    <input 
                        type="text" 
                        value={textInput}
                        onChange={(e) => setTextInput(e.target.value)}
                        placeholder="Type commands (e.g. 'Type in google.com', 'Summarize screen')..."
                        className="w-full bg-slate-800/50 border border-slate-700 rounded-lg pl-4 pr-12 py-3 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-nova-500/50 focus:ring-1 focus:ring-nova-500/50 transition-all"
                        disabled={status !== NovaStatus.LISTENING && status !== NovaStatus.SPEAKING && status !== NovaStatus.THINKING}
                    />
                    <button 
                        type="submit"
                        disabled={!textInput.trim()}
                        className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-slate-400 hover:text-nova-400 disabled:opacity-50 disabled:hover:text-slate-400 transition-colors"
                    >
                        <Send className="w-4 h-4" />
                    </button>
                </form>
            </div>
        </div>

        {/* Right Column: System Logs */}
        <div className="lg:col-span-5 h-full overflow-hidden">
            <Console logs={logs} />
        </div>

      </main>
    </div>
  );
}

const FeatureCard = ({ icon, title, desc }: { icon: React.ReactNode, title: string, desc: string }) => (
    <div className="bg-slate-800/50 border border-slate-700 p-5 rounded-xl hover:bg-slate-800 transition-colors flex flex-col gap-3 group">
        <div className="p-2 bg-slate-900 rounded-lg w-fit group-hover:scale-110 transition-transform">
            {icon}
        </div>
        <div>
            <h3 className="font-bold text-slate-200 mb-1">{title}</h3>
            <p className="text-sm text-slate-400 leading-relaxed">{desc}</p>
        </div>
    </div>
);

export default App;