import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Card } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { Button } from '../components/ui/button';

interface SignupResponse {
  token: string;
  user: {
    id: string;
    username: string;
    email: string | null;
    created_at: number;
    last_login: number | null;
  };
  message?: string;
}

export default function Signup() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();
  const { setAuth } = useAuth();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      const response = await fetch('/api/signup', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          username: username.trim(),
          password: password.trim(),
          email: email.trim(),
        }),
      });

      const data = (await response.json()) as SignupResponse;

      if (!response.ok) {
        throw new Error(data.message || 'Signup failed');
      }

      // Update auth context
      setAuth(data.token, data.user.id, data.user.username);

      // Redirect to chat
      navigate('/');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#18181b] py-12 px-4 sm:px-6 lg:px-8">
      <Card className="w-full max-w-md p-8 space-y-8">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-white">Create Account</h1>
          <p className="mt-2 text-sm text-gray-400">Sign up to start chatting</p>
        </div>

        <form onSubmit={handleSubmit} className="mt-8 space-y-6" autoComplete="on">
          {error && (
            <div className="p-3 text-sm text-red-400 bg-red-900/20 rounded-md border border-red-900/50">{error}</div>
          )}

          <div className="space-y-4">
            <div>
              <label htmlFor="username" className="block text-sm font-medium text-gray-300">
                Username
              </label>
              <Input
                id="username"
                name="username"
                type="text"
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="mt-1"
                placeholder="Choose a username"
                autoComplete="username"
                aria-label="Username"
              />
            </div>

            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-300">
                Email (optional)
              </label>
              <Input
                id="email"
                name="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-1"
                placeholder="Enter your email"
                autoComplete="email"
                aria-label="Email"
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-300">
                Password
              </label>
              <Input
                id="password"
                name="password"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="mt-1"
                placeholder="Create a password"
                autoComplete="new-password"
                aria-label="Password"
              />
            </div>
          </div>

          <Button
            type="submit"
            disabled={isLoading || !username.trim() || !password.trim()}
            className="w-full bg-[#bf94ff] hover:bg-[#a970ff] text-white disabled:bg-[#2d2d2d] disabled:text-gray-500"
          >
            {isLoading ? 'Creating account...' : 'Create account'}
          </Button>

          <div className="text-center text-sm">
            <span className="text-gray-400">Already have an account? </span>
            <Link to="/login" className="text-[#bf94ff] hover:text-[#a970ff] font-medium">
              Sign in
            </Link>
          </div>
        </form>
      </Card>
    </div>
  );
}
