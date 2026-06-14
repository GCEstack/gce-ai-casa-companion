interface StatusBadgeProps {
  status: 'online' | 'offline';
  label?: string;
  showDot?: boolean;
  className?: string;
}

export default function StatusBadge({ status, label, showDot = true, className = '' }: StatusBadgeProps) {
  const isOnline = status === 'online';
  const displayLabel = label || (isOnline ? 'Online' : 'Offline');

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      {showDot && (
        <span
          className={`w-2 h-2 rounded-full ${isOnline ? 'bg-green-500' : 'bg-red-500'}`}
          style={{ boxShadow: isOnline ? '0 0 8px rgba(34,197,94,0.5)' : '0 0 8px rgba(239,68,68,0.5)' }}
        />
      )}
      <span className={`text-xs font-medium ${isOnline ? 'text-green-400' : 'text-red-400'}`}>
        {displayLabel}
      </span>
      <span className="sr-only">{displayLabel}</span>
    </div>
  );
}
