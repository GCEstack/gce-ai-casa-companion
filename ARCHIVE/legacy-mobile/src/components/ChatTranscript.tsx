import { useEffect, useRef } from 'react';
import type { ChatMessage } from '@/hooks/useVoiceChat';
import { userName } from '@/lib/personalization';

interface ChatTranscriptProps {
  messages: ChatMessage[];
  characterName: string;
  accentColor: string;
}

export default function ChatTranscript({ messages, characterName, accentColor }: ChatTranscriptProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  if (messages.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center px-6">
        <p className="text-sm text-gray-500 text-center">
          {userName
            ? `Tap the mic and say hello, ${userName}.`
            : `Tap the mic and say hello to ${characterName}.`}
        </p>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
      {messages.map((msg, idx) => {
        const isUser = msg.role === 'user';
        return (
          <div key={idx} className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
            <div
              className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                isUser
                  ? 'bg-white/10 text-white rounded-br-md'
                  : 'text-white rounded-bl-md'
              }`}
              style={isUser ? {} : { backgroundColor: `${accentColor}20`, border: `1px solid ${accentColor}30` }}
            >
              <span className="text-[10px] uppercase tracking-wider opacity-60 block mb-0.5">
                {isUser ? 'You' : characterName}
              </span>
              {msg.text}
            </div>
          </div>
        );
      })}
      <div ref={bottomRef} />
    </div>
  );
}
