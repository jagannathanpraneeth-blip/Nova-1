import React, { useEffect, useRef } from 'react';
import { LogEntry } from '../types';
import { Terminal, Cpu, User, MessageSquare, AlertCircle, ExternalLink } from 'lucide-react';

interface ConsoleProps {
  logs: LogEntry[];
}

const Console: React.FC<ConsoleProps> = ({ logs }) => {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  const getIcon = (source: LogEntry['source'], type: LogEntry['type']) => {
    if (type === 'error') return <AlertCircle className="w-4 h-4 text-red-500" />;
    if (type === 'tool') return <Cpu className="w-4 h-4 text-amber-500" />;
    if (source === 'user') return <User className="w-4 h-4 text-blue-400" />;
    if (source === 'nova') return <MessageSquare className="w-4 h-4 text-emerald-400" />;
    return <Terminal className="w-4 h-4 text-slate-500" />;
  };

  return (
    <div className="flex flex-col h-full bg-slate-900/50 backdrop-blur-sm rounded-lg border border-slate-800 overflow-hidden shadow-xl">
      <div className="px-4 py-2 bg-slate-950/80 border-b border-slate-800 flex items-center gap-2">
        <Terminal className="w-4 h-4 text-nova-500" />
        <span className="text-xs font-mono font-bold text-slate-300 uppercase tracking-wider">System Logs</span>
      </div>
      
      <div className="flex-1 overflow-y-auto p-4 font-mono text-sm space-y-3">
        {logs.length === 0 && (
          <div className="text-slate-600 italic text-center mt-10">System ready. Waiting for connection...</div>
        )}
        
        {logs.map((log) => (
          <div key={log.id} className="flex gap-3 animate-fade-in">
            <div className="mt-0.5 shrink-0 opacity-80">
              {getIcon(log.source, log.type)}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-baseline gap-2 mb-0.5">
                <span className={`text-[10px] font-bold uppercase tracking-wider ${
                  log.source === 'user' ? 'text-blue-400' :
                  log.source === 'nova' ? 'text-emerald-400' : 'text-slate-500'
                }`}>
                  {log.source}
                </span>
                <span className="text-[10px] text-slate-600">{log.timestamp}</span>
              </div>
              <p className={`break-words whitespace-pre-wrap leading-relaxed ${
                log.type === 'error' ? 'text-red-400' :
                log.type === 'tool' ? 'text-amber-300' :
                log.source === 'user' ? 'text-slate-200' : 'text-slate-300'
              }`}>
                {log.message}
              </p>
              {log.link && (
                  <a 
                    href={log.link} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="mt-2 inline-flex items-center gap-1 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded text-xs text-blue-400 hover:text-blue-300 transition-colors"
                  >
                    Open Link <ExternalLink className="w-3 h-3" />
                  </a>
              )}
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
    </div>
  );
};

export default Console;