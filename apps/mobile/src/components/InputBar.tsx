import { useState, useCallback } from 'react';
import { Mic, Send, Square } from 'lucide-react';

type TurnState = 'idle' | 'wake_detected' | 'listening' | 'processing' | 'speaking' | 'interrupted' | 'error';

interface InputBarProps {
  turnState: TurnState;
  accentColor: string;
  onMicClick: () => void;
  onSend: (text: string) => void;
  disabled?: boolean;
  bargeInEnabled?: boolean;
}

export default function InputBar({
  turnState,
  accentColor,
  onMicClick,
  onSend,
  disabled = false,
  bargeInEnabled = true,
}: InputBarProps) {
  const [text, setText] = useState('');
  const isListening = turnState === 'listening' || turnState === 'wake_detected';
  const isProcessing = turnState === 'processing' || (turnState === 'speaking' && !bargeInEnabled);

  const handleSend = useCallback(() => {
    const trimmed = text.trim();
    if (!trimmed) return;
    onSend(trimmed);
    setText('');
  }, [text, onSend]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="flex items-center gap-2 px-3 py-3 bg-surface/95 backdrop-blur-md border-t border-white/5 safe-bottom">
      <button
        onClick={onMicClick}
        disabled={disabled || isProcessing}
        className="flex-shrink-0 w-11 h-11 rounded-full flex items-center justify-center active:scale-95 transition-transform disabled:opacity-50"
        style={{
          background: isListening ? '#ef4444' : accentColor,
          boxShadow: `0 0 16px ${isListening ? 'rgba(239,68,68,0.4)' : `${accentColor}40`}`,
        }}
        aria-label={isListening ? 'Stop recording' : 'Start recording'}
      >
        {isListening ? (
          <Square className="w-4 h-4 text-white fill-current" />
        ) : (
          <Mic className="w-5 h-5 text-white" />
        )}
      </button>

      <div className="flex-1 min-w-0">
        <input
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={isProcessing ? 'Thinking...' : 'Type a message...'}
          disabled={disabled || isProcessing}
          className="w-full h-11 px-4 rounded-full bg-background text-white text-sm placeholder-gray-500 outline-none border border-white/10 focus:border-white/20 disabled:opacity-50"
        />
      </div>

      <button
        onClick={handleSend}
        disabled={disabled || isProcessing || !text.trim()}
        className="flex-shrink-0 w-11 h-11 rounded-full bg-white/10 text-white flex items-center justify-center active:scale-95 transition-transform disabled:opacity-40"
        aria-label="Send message"
      >
        <Send className="w-4 h-4" />
      </button>
    </div>
  );
}
