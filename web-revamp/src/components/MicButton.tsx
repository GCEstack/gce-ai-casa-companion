import { useCallback } from 'react';
import { Mic, Loader2, Volume2 } from 'lucide-react';

interface MicButtonProps {
  isListening: boolean;
  isProcessing: boolean;
  isSpeaking: boolean;
  accentColor: string;
  onPress: () => void;
  disabled?: boolean;
}

export default function MicButton({
  isListening,
  isProcessing,
  isSpeaking,
  accentColor,
  onPress,
  disabled,
}: MicButtonProps) {
  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLButtonElement>) => {
      e.preventDefault();
      e.stopPropagation();
      if (!disabled && !isProcessing && !isSpeaking) {
        onPress();
      }
    },
    [onPress, disabled, isProcessing, isSpeaking]
  );

  const handleClick = useCallback((e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
  }, []);

  const label = isProcessing
    ? 'Thinking...'
    : isSpeaking
    ? 'Speaking...'
    : isListening
    ? 'Listening...'
    : 'Tap to Talk';

  const glowColor = isListening
    ? '#ef4444'
    : isSpeaking
    ? '#22c55e'
    : isProcessing
    ? '#f97316'
    : accentColor;

  return (
    <button
      type="button"
      onPointerDown={handlePointerDown}
      onClick={handleClick}
      disabled={disabled || isProcessing || isSpeaking}
      aria-pressed={isListening}
      aria-label={label}
      className={`
        relative w-20 h-20 md:w-24 md:h-24 rounded-full flex items-center justify-center
        transition-all duration-200
        disabled:opacity-40 disabled:cursor-not-allowed
        active:scale-90
        [touch-action:manipulation]
        [-webkit-tap-highlight-color:transparent]
        [-webkit-touch-callout:none]
        [user-select:none]
      `}
      style={{
        background: isListening
          ? `rgba(239,68,68,0.2)`
          : isProcessing
          ? `rgba(249,115,22,0.2)`
          : isSpeaking
          ? `rgba(34,197,94,0.2)`
          : 'rgba(255,255,255,0.08)',
        border: `2px solid ${
          isListening
            ? '#ef4444'
            : isProcessing
            ? '#f97316'
            : isSpeaking
            ? '#22c55e'
            : 'rgba(255,255,255,0.25)'
        }`,
        boxShadow: isListening
          ? `0 0 0 0 rgba(239,68,68,0.4), 0 0 30px rgba(239,68,68,0.5)`
          : isSpeaking
          ? `0 0 30px rgba(34,197,94,0.5)`
          : `0 0 30px ${accentColor}40`,
      }}
      onMouseEnter={(e) => {
        if (!isListening && !isProcessing && !isSpeaking) {
          e.currentTarget.style.background = 'rgba(255,255,255,0.15)';
        }
      }}
      onMouseLeave={(e) => {
        if (!isListening && !isProcessing && !isSpeaking) {
          e.currentTarget.style.background = 'rgba(255,255,255,0.08)';
        }
      }}
    >
      {isProcessing ? (
        <Loader2 className="w-7 h-7 md:w-8 md:h-8 text-white animate-spin" />
      ) : isSpeaking ? (
        <Volume2 className="w-7 h-7 md:w-8 md:h-8 text-white" />
      ) : (
        <Mic className="w-7 h-7 md:w-8 md:h-8 text-white" />
      )}

      {isListening && (
        <span
          className="absolute inset-0 rounded-full animate-ping opacity-40"
          style={{ background: '#ef4444' }}
        />
      )}

      {/* Outer glow ring */}
      <span
        className="absolute inset-[-8px] rounded-full opacity-40 pointer-events-none"
        style={{
          background: `radial-gradient(circle, ${glowColor}30, transparent 70%)`,
          filter: 'blur(8px)',
        }}
      />
    </button>
  );
}
