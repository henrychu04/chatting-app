import { createContext, useContext, useState, useEffect, ReactNode } from 'react';

interface AuthContextType {
  authToken: string | null;
  userId: string | null;
  username: string | null;
  setAuth: (token: string | null, id: string | null, name: string | null) => void;
}

const AuthContext = createContext<AuthContextType>({
  authToken: null,
  userId: null,
  username: null,
  setAuth: () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [authToken, setAuthToken] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [username, setUsername] = useState<string | null>(null);

  useEffect(() => {
    // Load auth data from localStorage on mount
    const storedToken = localStorage.getItem('authToken');
    const storedUserId = localStorage.getItem('userId');
    const storedUsername = localStorage.getItem('username');

    if (storedToken && storedUserId && storedUsername) {
      setAuthToken(storedToken);
      setUserId(storedUserId);
      setUsername(storedUsername);
    }
  }, []);

  const setAuth = (token: string | null, id: string | null, name: string | null) => {
    setAuthToken(token);
    setUserId(id);
    setUsername(name);

    if (token && id && name) {
      localStorage.setItem('authToken', token);
      localStorage.setItem('userId', id);
      localStorage.setItem('username', name);
    } else {
      localStorage.removeItem('authToken');
      localStorage.removeItem('userId');
      localStorage.removeItem('username');
    }
  };

  return <AuthContext.Provider value={{ authToken, userId, username, setAuth }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
