import { Outlet, useLocation } from 'react-router';
import { useApp } from '@/context/AppContext';
import TopToolbar from '@/components/TopToolbar';
import RightSidebar from '@/sections/RightSidebar';
import { Background } from '@/components/Background';

export function MainLayout() {
  const location = useLocation();
  const { state } = useApp();
  const isLanding = location.pathname === '/';

  return (
    <>
      <Background />
      <div className={`app-layout ${isLanding ? 'landing-layout' : ''}`}>
        <TopToolbar />
        <main className="main-content">
          <Outlet />
        </main>
        {!isLanding && <RightSidebar character={state.selectedCharacter} />}
      </div>
    </>
  );
}
