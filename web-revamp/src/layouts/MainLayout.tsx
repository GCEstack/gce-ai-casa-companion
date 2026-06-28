import { Outlet, useLocation } from 'react-router';
import { useApp } from '@/context/AppContext';
import TopToolbar from '@/components/TopToolbar';
import RightSidebar from '@/sections/RightSidebar';

export function MainLayout() {
  const location = useLocation();
  const { state } = useApp();
  const isLanding = location.pathname === '/';

  return (
    <div className={`app-layout ${isLanding ? 'landing-layout' : ''}`}>
      <TopToolbar />
      <main className="main-content">
        <Outlet />
      </main>
      {!isLanding && <RightSidebar character={state.selectedCharacter} />}
    </div>
  );
}
