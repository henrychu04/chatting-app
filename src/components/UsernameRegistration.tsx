import { useState } from 'react';
import { Input } from './ui/input';
import { Button } from './ui/button';

interface UsernameRegistrationProps {
  onRegister: (username: string) => void;
}

const UsernameRegistration = ({ onRegister }: UsernameRegistrationProps) => {
  const [username, setUsername] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('username') || '';
    }
    return '';
  });
  const [error, setError] = useState<string | null>(null);
  const [isRegistering, setIsRegistering] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim()) return;

    setIsRegistering(true);
    try {
      const response = await fetch('/api/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username.trim() }),
      });

      if (!response.ok) {
        throw new Error('Failed to register username');
      }

      const data = await response.json();
      localStorage.setItem('username', data.username);
      onRegister(data.username);
    } catch (error) {
      console.error('Error registering username:', error);
      setError('Failed to register username. Please try again.');
    } finally {
      setIsRegistering(false);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-100">
      <div className="w-full max-w-md p-8 space-y-8 bg-white rounded-lg shadow-md">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900">Welcome to Chat</h1>
          <p className="mt-2 text-gray-600">Please enter your username to continue</p>
        </div>
        <form onSubmit={handleSubmit} className="mt-8 space-y-6">
          <div>
            <Input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Enter your username"
              disabled={isRegistering}
              className="w-full"
            />
          </div>
          {error && <p className="text-sm text-red-500">{error}</p>}
          <Button type="submit" disabled={isRegistering || !username.trim()} className="w-full">
            {isRegistering ? 'Registering...' : 'Continue'}
          </Button>
        </form>
      </div>
    </div>
  );
};

export default UsernameRegistration;
