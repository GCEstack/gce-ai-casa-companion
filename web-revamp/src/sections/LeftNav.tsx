import type { Character } from '@/types';
import StatusBadge from '@/components/StatusBadge';
import { useApp } from '@/context/AppContext';

interface LeftNavProps {
  character: Character;
}

export default function LeftNav({ character }: LeftNavProps) {
  const { state } = useApp();

  return (
    <aside className="hidden lg:flex flex-col w-[200px] h-full py-6 px-4 gap-4">
      {/* Logo */}
      <div className="flex items-center gap-1.5">
        <span className="text-sm font-extrabold text-white tracking-tight">CASA</span>
        <span className="w-1.5 h-1.5 rounded-full bg-[#d4a843]" />
      </div>

      {/* Talking with */}
      <div className="mt-4">
        <p className="text-[11px] text-gray-500 uppercase tracking-wider mb-1">Talking with</p>
        <p className="text-sm font-medium text-white">{character.name}</p>
      </div>

      {/* Status */}
      <div className="mt-auto">
        <StatusBadge status={state.connectionStatus} showDot={true} />
      </div>
    </aside>
  );
}
