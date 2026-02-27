import { Outlet } from 'react-router-dom';

export function CustomerLayout() {
  return (
    <div className="w-screen h-screen overflow-hidden bg-black">
      <Outlet />
    </div>
  );
}

