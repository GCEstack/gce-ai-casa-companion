import { Outlet } from 'react-router';
import { Background } from '@/components/Background';

export function MainLayout() {
  return (
    <>
      <Background />
      <div className="app-layout">
        <main className="main-content">
          <Outlet />
        </main>
      </div>
    </>
  );
}
