interface ConnectionDotProps {
  isConnected: boolean;
  isConnecting: boolean;
  className?: string;
}

export default function ConnectionDot({
  isConnected,
  isConnecting,
  className = '',
}: ConnectionDotProps) {
  const label = isConnected
    ? 'Voice server connected'
    : isConnecting
      ? 'Connecting to voice server'
      : 'Voice server disconnected';

  return (
    <div
      className={`w-2 h-2 rounded-full ${
        isConnected
          ? 'bg-green-500'
          : isConnecting
            ? 'bg-yellow-500 animate-pulse'
            : 'bg-red-500'
      } ${className}`}
      title={label}
      aria-label={label}
      role="status"
    />
  );
}
