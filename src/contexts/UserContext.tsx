import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';

interface UserData {
  id: string;
  username: string;
}

interface UserContextType {
  user: UserData | null;
  authToken: string | null;
  setUser: (user: UserData | null) => void;
  setAuthToken: (token: string | null) => void;
  logout: () => void;
}

const UserContext = createContext<UserContextType | undefined>(undefined);

export function UserProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserData | null>(null);
  const [authToken, setAuthToken] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    // Load user data from localStorage on mount
    const token = localStorage.getItem('authToken');
    const userStr = localStorage.getItem('user');

    if (token && userStr) {
      try {
        const userData = JSON.parse(userStr) as UserData;
        if (userData && typeof userData === 'object' && userData.username && userData.id) {
          console.log('User data loaded:', userData);
          setUser(userData);
          setAuthToken(token);
        } else {
          console.error('Invalid user data format:', userData);
          handleLogout();
        }
      } catch (err) {
        console.error('Error parsing user data:', err);
        handleLogout();
      }
    }
  }, []);

  const handleLogout = () => {
    localStorage.removeItem('authToken');
    localStorage.removeItem('user');
    setUser(null);
    setAuthToken(null);
    navigate('/login');
  };

  const value = {
    user,
    authToken,
    setUser,
    setAuthToken,
    logout: handleLogout,
  };

  return <UserContext.Provider value={value}>{children}</UserContext.Provider>;
}

export function useUser() {
  const context = useContext(UserContext);
  if (context === undefined) {
    throw new Error('useUser must be used within a UserProvider');
  }
  return context;
}
