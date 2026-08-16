import React from 'react';
import { LogEntry } from '../types';

interface LogPanelProps {
  logs: LogEntry[];
}

const LogPanel: React.FC<LogPanelProps> = ({ logs }) => {
  return (
    <div className="border border-neutral-800 rounded-lg overflow-hidden bg-neutral-900/50">
      <div className="px-4 py-3 border-b border-neutral-800 bg-neutral-900">
        <h3 className="text-xs font-semibold uppercase tracking-widest text-neutral-500">Activity Log</h3>
      </div>
      <div className="h-48 overflow-y-auto font-mono text-xs p-4 space-y-1.5 bg-black/20">
        {logs.length === 0 && (
          <div className="text-neutral-700 italic flex items-center justify-center h-full text-sm">
            <span className="opacity-50">No activity yet. Import or paste configs to begin.</span>
          </div>
        )}
        {logs.map((log, i) => (
          <div
            key={i}
            className={`flex gap-2 leading-relaxed ${
              log.type === 'error'
                ? 'text-red-400'
                : log.type === 'success'
                ? 'text-green-400'
                : log.type === 'warning'
                ? 'text-yellow-400'
                : 'text-neutral-400'
            }`}
          >
            <span className="text-neutral-600 shrink-0">[{log.timestamp.toLocaleTimeString()}]</span>
            <span>{log.message}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

export default LogPanel;
