import { Routes, Route } from 'react-router-dom';
import Landing from './pages/Landing';
import CharacterDetail from './pages/CharacterDetail';
import Favorites from './pages/Favorites';
import Settings from './pages/Settings';
import ParentalLock from './components/ParentalLock';

export default function App() {
  return (
    <ParentalLock>
      <div className="h-full flex flex-col bg-background">
        <main className="flex-1 overflow-y-auto safe-top safe-bottom">
          <Routes>
            <Route path="/" element={<Landing />} />
            <Route path="/favorites" element={<Favorites />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="/character/:slug" element={<CharacterDetail />} />
            <Route path="/character/:slug/:mode" element={<CharacterDetail />} />
          </Routes>
        </main>
      </div>
    </ParentalLock>
  );
}
