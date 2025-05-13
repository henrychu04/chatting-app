import { Outlet } from 'react-router-dom';
import { AuthProvider } from '../contexts/AuthContext';

export default function Index() {
  return (
    <AuthProvider>
      <div className="min-h-screen bg-gray-100">
        <Outlet />
      </div>
    </AuthProvider>
  );
}
