import { useState, useEffect, useRef } from 'react';
import { useWebSocket } from '../hooks/useWebSocket';
import { LogOut, LogIn, Send } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Button } from '../components/ui/button';
import { ScrollArea } from '../components/ui/scroll-area';
import { Input } from '../components/ui/input';

const MAX_MESSAGE_LENGTH = 1000;

// Twitch-like colors for usernames
const USER_COLORS = [
  '#FF0000',
  '#0000FF',
  '#008000',
  '#B22222',
  '#FF7F50',
  '#9ACD32',
  '#FF4500',
  '#2E8B57',
  '#DAA520',
  '#D2691E',
  '#5F9EA0',
  '#1E90FF',
  '#FF69B4',
  '#8A2BE2',
  '#00FF7F',
];

// Generate a consistent color for a username
const getUsernameColor = (username: string) => {
  const hash = username.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
  return USER_COLORS[hash % USER_COLORS.length];
};

export default function Room() {
  const { username, setAuth } = useAuth();
  const [message, setMessage] = useState('');
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const { messages, sendMessage, error: wsError, isConnected, connectionCount } = useWebSocket('main');

  useEffect(() => {
    if (wsError) {
      console.error('WebSocket error:', wsError);
      setError(wsError);
    }
  }, [wsError]);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim() || message.length > MAX_MESSAGE_LENGTH || !username) {
      console.error('Cannot send message:', { message, username });
      return;
    }

    try {
      console.log('Sending message with user data:', { username });
      sendMessage(message);
      setMessage('');
    } catch (err) {
      console.error('Failed to send message:', err);
      setError('Failed to send message. Please try again.');
    }
  };

  const handleLogout = () => {
    setAuth(null, null, null);
    navigate('/login');
  };

  return (
    <div className="min-h-screen bg-[#0e0e10] flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-[#1f1f23] bg-[#18181b]">
        <div className="flex items-center space-x-4">
          <h1 className="text-xl font-bold text-white">Chat Room</h1>
          <div className="text-sm text-gray-400">
            {isConnected ? (
              <span className="flex items-center">
                <span className="w-2 h-2 bg-[#00ad03] rounded-full mr-2"></span>
                {connectionCount} online
              </span>
            ) : (
              <span className="flex items-center">
                <span className="w-2 h-2 bg-red-500 rounded-full mr-2"></span>
                Disconnected
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center space-x-4">
          <span className="text-gray-300">Welcome, {username || 'Guest'}</span>
          <Button variant="ghost" size="icon" onClick={handleLogout} className="text-gray-400 hover:text-white">
            {username ? <LogOut className="h-5 w-5" /> : <LogIn className="h-5 w-5" />}
          </Button>
        </div>
      </div>

      {/* Chat Area */}
      <div className="flex-1 overflow-hidden bg-[#0e0e10]">
        <ScrollArea className="h-full">
          <div className="p-4 space-y-1">
            {messages.map((msg) => (
              <div key={msg.id} className="flex items-start space-x-2 group">
                <span className="text-[#bf94ff] text-sm font-medium" style={{ color: getUsernameColor(msg.user) }}>
                  {msg.user}
                </span>
                <span className="text-gray-300 text-sm flex-1 break-words">{msg.content}</span>
                <span className="text-gray-500 text-xs opacity-0 group-hover:opacity-100 transition-opacity">
                  {new Date(msg.timestamp).toLocaleTimeString()}
                </span>
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>
        </ScrollArea>
      </div>

      {/* Message Input */}
      <form onSubmit={handleSendMessage} className="p-4 border-t border-[#1f1f23] bg-[#18181b]">
        <div className="flex space-x-4">
          <Input
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Type a message..."
            className="flex-1 bg-[#1f1f23] border-[#2d2d2d] text-white placeholder-gray-400 focus:border-[#bf94ff] focus:ring-[#bf94ff]"
            disabled={!username}
          />
          <Button
            type="submit"
            disabled={!message.trim() || message.length > MAX_MESSAGE_LENGTH || !username}
            className="bg-[#bf94ff] hover:bg-[#a970ff] text-white disabled:bg-[#2d2d2d] disabled:text-gray-500"
          >
            <Send className="h-5 w-5" />
          </Button>
        </div>
        {error && (
          <div className="mt-2 text-sm text-red-400 bg-red-900/20 rounded-md p-2 border border-red-900/50">{error}</div>
        )}
      </form>
    </div>
  );
}
