import { Home, Settings, Heart } from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';

export default function BottomNav() {
  const navigate = useNavigate();
  const location = useLocation();
  const path = location.pathname;

  const items = [
    { icon: Home, label: 'Home', path: '/', active: path === '/' },
    { icon: Heart, label: 'Favorites', path: '/favorites', active: path === '/favorites' },
    { icon: Settings, label: 'Settings', path: '/settings', active: path === '/settings' },
  ];

  return (
    <nav className="pointer-events-none fixed bottom-0 left-0 right-0 z-40 flex justify-center pb-4 safe-bottom">
      <div className="pointer-events-auto flex items-center gap-1 px-2 py-2 rounded-full bg-surface/90 backdrop-blur-md border border-white/10 shadow-xl">
        {items.map((item) => (
          <button
            key={item.path}
            onClick={() => navigate(item.path)}
            aria-label={item.label}
            aria-current={item.active ? 'page' : undefined}
            className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-all ${
              item.active
                ? 'bg-accent text-black'
                : 'text-gray-400 hover:text-white hover:bg-white/5'
            }`}
          >
            <item.icon className="w-5 h-5" />
            {item.active && <span>{item.label}</span>}
          </button>
        ))}
      </div>
    </nav>
  );
}
