import { Outlet } from 'react-router-dom';

export function CustomerLayout() {
  return (
    <div className="min-h-screen w-full overflow-x-hidden bg-gray-100">
      <Outlet />
    </div>
  );
}
