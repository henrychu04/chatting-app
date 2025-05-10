import { useState, useEffect } from 'react';
import { Input } from './ui/input';
import { Button } from './ui/button';
import { Card } from './ui/card';
import { ScrollArea } from './ui/scroll-area';
import { useWebSocket } from '../hooks/useWebSocket';
import { LogOut, LogIn, Send } from 'lucide-react';
import { useUser } from '../contexts/UserContext';
import { useNavigate } from 'react-router-dom';

const MAX_MESSAGE_LENGTH = 1000;

export default function Room() {
  const { user, authToken, logout } = useUser();
  const [message, setMessage] = useState('');
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  const {
    messages,
    sendMessage,
    error: wsError,
    isConnected,
    connectedUsers,
  } = useWebSocket({
    roomId: 'main',
    authToken: authToken || undefined,
    userId: user?.id,
    username: user?.username,
  });

  useEffect(() => {
    if (wsError) {
      console.error('WebSocket error:', wsError);
      setError(wsError);
    }
  }, [wsError]);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim() || message.length > MAX_MESSAGE_LENGTH || !user) {
      console.error('Cannot send message:', { message, user });
      return;
    }

    try {
      console.log('Sending message with user data:', user);
      sendMessage(message);
      setMessage('');
    } catch (err) {
      console.error('Failed to send message:', err);
      setError('Failed to send message. Please try again.');
    }
  };

  return (
    <div className="flex h-screen bg-[#18181b] text-white">
      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col">
        {/* Chat Header */}
        <Card className="flex justify-between items-center border-b-0 rounded-none">
          <h2 className="text-lg font-semibold text-white">Chat</h2>
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`} />
            <span className="text-sm text-gray-400">
              {connectedUsers} {connectedUsers === 1 ? 'user' : 'users'} online
            </span>
          </div>
        </Card>

        {/* Messages Area */}
        <ScrollArea className="flex-1 p-4 space-y-2" autoScroll>
          {messages.map((msg, index) => (
            <Card key={index} variant="message" className="flex items-start gap-2 text-sm">
              <span className="text-[#bf94ff] font-medium">{msg.user}:</span>
              <span className="text-[#efeff1]">{msg.content}</span>
            </Card>
          ))}
        </ScrollArea>

        {/* Input Area */}
        <Card className="border-t-0 rounded-none">
          <form onSubmit={handleSendMessage} className="flex gap-2">
            <Input
              type="text"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder={user ? 'Send a message' : 'Please log in to send messages'}
              disabled={!isConnected || !user}
              className="flex-1 bg-[#2d2d2d] border-[#2d2d2d] text-white placeholder:text-gray-500 focus:border-[#bf94ff] focus:ring-[#bf94ff]"
            />
            <Button
              type="submit"
              disabled={!isConnected || !message.trim() || !user}
              className="bg-[#bf94ff] hover:bg-[#a970ff] text-white disabled:bg-[#2d2d2d] disabled:text-gray-500"
            >
              <Send className="h-4 w-4" />
            </Button>
          </form>
        </Card>
      </div>

      {/* User Info Sidebar */}
      <Card className="w-64 border-l border-[#2d2d2d] rounded-none">
        <div className="mb-4 flex justify-between items-center">
          <div>
            <h2 className="text-lg font-semibold text-white">
              {user ? `Welcome, ${user.username}` : 'Welcome, Guest'}
            </h2>
            {error && <p className="text-red-500 text-sm mt-1">{error}</p>}
          </div>
          {user ? (
            <Button
              variant="ghost"
              size="icon"
              onClick={logout}
              title="Logout"
              className="text-gray-400 hover:text-white hover:bg-[#2d2d2d]"
            >
              <LogOut className="h-5 w-5" />
            </Button>
          ) : (
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigate('/login')}
              title="Login"
              className="text-gray-400 hover:text-white hover:bg-[#2d2d2d]"
            >
              <LogIn className="h-5 w-5" />
            </Button>
          )}
        </div>
      </Card>
    </div>
  );
}
