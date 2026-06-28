export function Background() {
  return (
    <div className="fixed inset-0 -z-10 pointer-events-none overflow-hidden bg-[var(--casa-bg)]">
      <div className="absolute inset-0 opacity-40">
        <div
          className="absolute -top-1/4 -left-1/4 w-[60vw] h-[60vw] rounded-full blur-[120px] animate-float-slow"
          style={{ background: 'radial-gradient(circle, rgba(251,140,0,0.12) 0%, transparent 70%)' }}
        />
        <div
          className="absolute top-1/2 -right-1/4 w-[50vw] h-[50vw] rounded-full blur-[120px] animate-float-slower"
          style={{ background: 'radial-gradient(circle, rgba(139,92,246,0.10) 0%, transparent 70%)' }}
        />
        <div
          className="absolute -bottom-1/4 left-1/3 w-[45vw] h-[45vw] rounded-full blur-[120px] animate-float-slow"
          style={{ background: 'radial-gradient(circle, rgba(20,184,166,0.08) 0%, transparent 70%)' }}
        />
      </div>
      <div
        className="absolute inset-0"
        style={{
          background:
            'linear-gradient(180deg, rgba(10,10,15,0.2) 0%, rgba(10,10,15,0.85) 50%, rgba(10,10,15,1) 100%)',
        }}
      />
    </div>
  );
}
