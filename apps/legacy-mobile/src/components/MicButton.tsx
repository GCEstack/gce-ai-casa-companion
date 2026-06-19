import { Mic } from 'lucide-react';

interface MicButtonProps {
  isListening?: boolean;
  isProcessing?: boolean;
  onClick?: () => void;
  disabled?: boolean;
  accentColor?: string;
}

export default function MicButton({
  isListening = false,
  isProcessing = false,
  onClick,
  disabled = false,
  accentColor = '#d4a843',
}: MicButtonProps) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="w-20 h-20 rounded-full flex items-center justify-center shadow-lg active:scale-95 transition-transform disabled:opacity-50"
      style={{
        background: isListening ? '#ef4444' : accentColor,
        boxShadow: `0 0 20px ${isListening ? 'rgba(239,68,68,0.5)' : `${accentColor}50`}`,
      }}
    >
      {isProcessing ? (
        <div className="w-6 h-6 border-2 border-white/30 border-t-white rounded-full animate-spin" />
      ) : (
        <Mic className="w-8 h-8 text-white" />
      )}
    </button>
  );
}
