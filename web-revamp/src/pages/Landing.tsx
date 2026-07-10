import { useNavigate } from 'react-router';
import { Mic } from 'lucide-react';

export default function Landing() {
  const navigate = useNavigate();

  return (
    <main className="relative h-[100dvh] w-full flex flex-col items-center justify-center overflow-hidden bg-[#060610]">
      {/* Ambient glow */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div
          className="absolute top-[-20%] left-[-10%] w-[60vw] h-[60vw] rounded-full blur-[120px]"
          style={{ background: 'radial-gradient(circle, rgba(255,110,199,0.12) 0%, transparent 70%)' }}
        />
        <div
          className="absolute bottom-[-20%] right-[-10%] w-[60vw] h-[60vw] rounded-full blur-[120px]"
          style={{ background: 'radial-gradient(circle, rgba(0,245,255,0.10) 0%, transparent 70%)' }}
        />
      </div>

      <div className="relative z-10 flex flex-col items-center text-center px-6">
        <div className="flex items-center justify-center gap-3 mb-6">
          <div
            className="w-12 h-12 rounded-2xl flex items-center justify-center"
            style={{
              background: 'linear-gradient(135deg, #FF6EC7 0%, #00F5FF 100%)',
              boxShadow: '0 0 40px rgba(255,110,199,0.3)',
            }}
          >
            <Mic className="w-6 h-6 text-white" />
          </div>
        </div>

        <h1
          className="text-5xl md:text-7xl font-black text-white mb-4"
          style={{
            textShadow: '0 0 60px rgba(255,110,199,0.3)',
            fontFamily: 'Inter, system-ui, sans-serif',
          }}
        >
          Casa Companion
        </h1>

        <p className="text-base md:text-lg text-white/50 max-w-md mb-10">
          Your AI friend is waiting.
        </p>

        <button
          type="button"
          onClick={() => navigate('/name')}
          className="px-8 py-4 rounded-full text-white font-bold text-lg transition-transform active:scale-95"
          style={{
            background: 'linear-gradient(135deg, #FF6EC7 0%, #00F5FF 100%)',
            boxShadow: '0 0 40px rgba(255,110,199,0.3)',
          }}
        >
          Enter Casa
        </button>
      </div>
    </main>
  );
}
