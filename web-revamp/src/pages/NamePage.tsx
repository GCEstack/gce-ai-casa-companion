import { useNavigate } from 'react-router';
import { Mic } from 'lucide-react';
import { NamePrompt } from '@/components/NamePrompt';
import { useApp } from '@/context/AppContext';

export default function NamePage() {
  const navigate = useNavigate();
  const { dispatch } = useApp();

  const handleSubmit = (name: string) => {
    dispatch({ type: 'SET_USER_NAME', payload: name });
    localStorage.setItem('casa-user-name', name);
    navigate('/characters');
  };

  return (
    <main className="relative h-[100dvh] w-full flex flex-col items-center justify-center overflow-hidden bg-[#060610] px-6">
      {/* Ambient glow */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div
          className="absolute top-[-20%] right-[-10%] w-[60vw] h-[60vw] rounded-full blur-[120px]"
          style={{ background: 'radial-gradient(circle, rgba(255,110,199,0.12) 0%, transparent 70%)' }}
        />
        <div
          className="absolute bottom-[-20%] left-[-10%] w-[60vw] h-[60vw] rounded-full blur-[120px]"
          style={{ background: 'radial-gradient(circle, rgba(0,245,255,0.10) 0%, transparent 70%)' }}
        />
      </div>

      <div className="relative z-10 flex flex-col items-center text-center w-full max-w-sm">
        <div className="flex items-center justify-center gap-2 mb-8">
          <Mic className="w-5 h-5 text-[#FF6EC7]" />
          <span className="text-lg font-bold text-white/90 tracking-tight">Casa Companion</span>
        </div>

        <h2 className="text-3xl md:text-4xl font-black text-white mb-8">What should we call you?</h2>

        <NamePrompt onSubmit={handleSubmit} />
      </div>
    </main>
  );
}
