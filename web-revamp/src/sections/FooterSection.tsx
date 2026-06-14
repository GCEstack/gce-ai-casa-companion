export default function FooterSection() {
  return (
    <footer
      className="relative z-10 py-8 px-6 border-t"
      style={{ borderColor: 'rgba(255,255,255,0.06)' }}
    >
      <div className="max-w-[900px] mx-auto flex items-center justify-between">
        <span className="text-xs text-gray-600">CASA Companion</span>
        <span className="text-xs text-gray-600">Powered by voice</span>
      </div>
    </footer>
  );
}
