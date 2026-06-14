import { Mic, Send, ChevronUp } from 'lucide-react';
import { useState, useCallback, useRef, useEffect } from 'react';
import { useApp } from '@/context/AppContext';
import type { UseVoiceChatReturn } from '@/hooks/useVoiceChat';

interface BottomBarProps {
  voice: UseVoiceChatReturn;
}

export default function BottomBar({ voice }: BottomBarProps) {
  const [message, setMessage] = useState('');
  const { state } = useApp();
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [voice.messages]);

  const handleSend = useCallback(async () => {
    if (!message.trim()) return;
    const text = message.trim();
    setMessage('');
    await voice.sendText(text);
  }, [message, voice]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend]
  );

  const handleMicClick = useCallback(async () => {
    if (!state.micPermission) {
      const granted = await voice.requestMicPermission();
      if (!granted) return;
    }

    if (state.isRecording) {
      await voice.stopRecording();
    } else {
      voice.startRecording();
    }
  }, [state.isRecording, state.micPermission, voice]);

  return (
    <div
      className="fixed bottom-0 left-0 right-0 z-40 flex flex-col"
      style={{
        background: 'rgba(10,10,15,0.95)',
        backdropFilter: 'blur(12px)',
        borderTop: '1px solid rgba(255,255,255,0.06)',
        maxHeight: '40vh',
      }}
    >
      {/* Chat history */}
      {voice.messages.length > 0 && (
        <div
          ref={scrollRef}
          className="flex-1 overflow-y-auto px-4 py-3 space-y-2"
          style={{ maxHeight: 'calc(40vh - 64px)' }}
        >
          {voice.messages.map((msg, idx) => (
            <div
              key={idx}
              className={`text-sm ${
                msg.role === 'user' ? 'text-gray-400' : 'text-[#d4a843]'
              }`}
            >
              <span className="font-medium">
                {msg.role === 'user' ? 'You' : state.selectedCharacter?.name || 'Companion'}:
              </span>{' '}
              {msg.text}
            </div>
          ))}
        </div>
      )}

      {/* Input bar */}
      <div className="h-16 flex items-center gap-3 px-4 md:px-6 shrink-0">
        {/* Mic button */}
        <button
          className="flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center transition-colors"
          style={{
            background: state.isRecording
              ? 'rgba(34,197,94,0.2)'
              : 'rgba(255,255,255,0.08)',
          }}
          onMouseEnter={(e) => {
            if (!state.isRecording) e.currentTarget.style.background = 'rgba(255,255,255,0.15)';
          }}
          onMouseLeave={(e) => {
            if (!state.isRecording) e.currentTarget.style.background = 'rgba(255,255,255,0.08)';
          }}
          onClick={handleMicClick}
        >
          <Mic
            className={`w-4 h-4 transition-colors ${
              state.isRecording ? 'text-green-400' : 'text-gray-300'
            }`}
          />
        </button>

        {/* Input */}
        <div className="flex-1 max-w-xl mx-auto">
          <input
            type="text"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={state.micPermission ? 'Type a message...' : 'Connect to send a message'}
            className="w-full h-10 px-4 rounded-full text-sm text-white placeholder-gray-500 outline-none transition-colors"
            style={{
              background: '#14141f',
              border: '1px solid rgba(255,255,255,0.08)',
            }}
            onFocus={(e) => { e.currentTarget.style.borderColor = 'rgba(212,168,67,0.3)'; }}
            onBlur={(e) => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)'; }}
          />
        </div>

        {/* Send button */}
        <button
          className="flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center transition-colors"
          style={{ background: 'rgba(255,255,255,0.08)' }}
          onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.15)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.08)'; }}
          onClick={handleSend}
        >
          <Send className="w-4 h-4 text-gray-300" />
        </button>

        {/* Chevron up */}
        <button
          className="flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center transition-colors"
          style={{ background: 'rgba(255,255,255,0.08)' }}
          onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.15)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.08)'; }}
        >
          <ChevronUp className="w-4 h-4 text-gray-300" />
        </button>
      </div>
    </div>
  );
}
