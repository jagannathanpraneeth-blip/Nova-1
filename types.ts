export interface LogEntry {
  id: string;
  timestamp: string;
  source: 'user' | 'nova' | 'system';
  message: string;
  type: 'text' | 'tool' | 'error' | 'info';
  link?: string; // Optional URL for tool outputs
}

export enum NovaStatus {
  IDLE = 'IDLE',
  CONNECTING = 'CONNECTING',
  LISTENING = 'LISTENING',
  THINKING = 'THINKING', // Receiving stream but not strictly "thinking" block
  SPEAKING = 'SPEAKING',
  ERROR = 'ERROR'
}

export interface NovaConfig {
  voiceName: string;
  prebuiltVoiceConfig: {
    voiceName: string;
  }
}