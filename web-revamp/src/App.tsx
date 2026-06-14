import { Routes, Route, useLocation } from 'react-router';
import { AppProvider } from '@/context/AppContext';
import { Toaster } from '@/components/ui/sonner';
import TopToolbar from '@/components/TopToolbar';
import RightSidebar from '@/sections/RightSidebar';
import Landing from '@/pages/Landing';
import CharacterDetail from '@/pages/CharacterDetail';
import { useApp } from '@/context/AppContext';

function AppLayout() {
  const location = useLocation();
  const { state } = useApp();
  const isLanding = location.pathname === '/';

  return (
    <div className={`app-layout ${isLanding ? 'landing-layout' : ''}`}>
      <TopToolbar />
      <main className="main-content">
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/character/:slug" element={<CharacterDetail />} />
          <Route path="/character/:slug/:mode" element={<CharacterDetail />} />
        </Routes>
      </main>
      {!isLanding && <RightSidebar character={state.selectedCharacter} />}
    </div>
  );
}

export default function App() {
  return (
    <AppProvider>
      <AppLayout />
      <Toaster position="top-center" richColors />
    </AppProvider>
  );
}
