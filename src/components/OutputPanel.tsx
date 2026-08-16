import React, { useRef } from 'react';

interface OutputPanelProps {
  title: string;
  content: string;
  type?: 'text' | 'json';
  onCopy?: () => void;
  onDownload?: () => void;
  remark?: string;
}

const OutputPanel: React.FC<OutputPanelProps> = ({ title, content, type = 'text', onCopy, onDownload, remark }) => {
  if (!content) return null;

  return (
    <div className="border border-neutral-800 rounded-lg overflow-hidden bg-neutral-900/50 animate-fadeIn">
      <div className="px-4 py-3 border-b border-neutral-800 bg-neutral-900 flex items-center justify-between flex-wrap gap-2">
        <h3 className="text-sm font-semibold text-neutral-200">{title}</h3>
        <div className="flex gap-2">
          {onCopy && (
            <button
              onClick={onCopy}
              className="px-3 py-1.5 text-xs font-medium text-neutral-400 border border-neutral-800 rounded-md hover:bg-neutral-800 hover:text-neutral-200 transition-colors"
            >
              Copy
            </button>
          )}
          {onDownload && (
            <button
              onClick={onDownload}
              className="px-3 py-1.5 text-xs font-medium text-neutral-400 border border-neutral-800 rounded-md hover:bg-neutral-800 hover:text-neutral-200 transition-colors"
            >
              Download
            </button>
          )}
        </div>
      </div>
      {remark && <div className="px-4 py-2 text-xs text-neutral-400 border-b border-neutral-800/50">{remark}</div>}
      <pre className="p-4 overflow-x-auto max-h-96 overflow-y-auto text-xs leading-relaxed text-neutral-300 font-mono bg-black/30 whitespace-pre-wrap break-all">
        <code>{content}</code>
      </pre>
    </div>
  );
};

export default OutputPanel;
