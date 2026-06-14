import { ChevronDown } from 'lucide-react';

export default function ScrollIndicator() {
  return (
    <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-10 flex flex-col items-center gap-2">
      <span className="text-xs text-gray-500 tracking-widest uppercase">Scroll</span>
      <div className="animate-bounce-slow">
        <ChevronDown className="w-5 h-5 text-gray-500" />
      </div>
    </div>
  );
}
