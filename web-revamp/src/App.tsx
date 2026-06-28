import { Routes, Route } from 'react-router';
import { AppProvider } from '@/context/AppContext';
import { Toaster } from '@/components/ui/sonner';
import { MainLayout } from '@/layouts/MainLayout';
import Landing from '@/pages/Landing';
import CharacterDetail from '@/pages/CharacterDetail';

export default function App() {
  return (
    <AppProvider>
      <Routes>
        <Route element={<MainLayout />}>
          <Route path="/" element={<Landing />} />
          <Route path="/character/:slug" element={<CharacterDetail />} />
          <Route path="/character/:slug/:mode" element={<CharacterDetail />} />
        </Route>
      </Routes>
      <Toaster position="top-center" richColors />
    </AppProvider>
  );
}
