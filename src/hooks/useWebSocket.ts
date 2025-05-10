import { useState, useEffect, useCallback, useRef } from 'react';

interface WebSocketMessage {
  type: string;
  content: string;
  user: string;
  timestamp: number;
  id?: string;
  message?: string; // For server message format
}

interface ServerMessage {
  message: string;
  user: string;
  timestamp: number;
  id: string;
}

interface BatchMessage {
  message?: string;
  content?: string;
  user: string;
  timestamp: number;
  id: string;
}

interface WebSocketHookProps {
  roomId: string;
  authToken?: string;
  userId?: string;
  username?: string;
}

interface WebSocketHookResult {
  messages: WebSocketMessage[];
  sendMessage: (content: string) => void;
  sendBatchMessage: (contents: string[]) => void;
  error: string | null;
  isConnected: boolean;
  connectedUsers: number;
}

export function useWebSocket({ roomId, authToken, userId, username }: WebSocketHookProps): WebSocketHookResult {
  const [messages, setMessages] = useState<WebSocketMessage[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [ws, setWs] = useState<WebSocket | null>(null);
  const [connectedUsers, setConnectedUsers] = useState(0);
  const [hasRequestedHistory, setHasRequestedHistory] = useState(false);
  const reconnectTimeoutRef = useRef<number | null>(null);

  const connect = useCallback(() => {
    // Clear any existing reconnect timeout
    if (reconnectTimeoutRef.current) {
      window.clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    // Only close existing connection if it's not already closed
    if (ws && ws.readyState === WebSocket.OPEN) {
      console.log('Closing existing WebSocket connection');
      ws.close();
    }

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws/${roomId}`;
    console.log('Connecting to WebSocket:', wsUrl);
    const socket = new WebSocket(wsUrl);

    socket.onopen = () => {
      console.log('WebSocket connection established');
      setIsConnected(true);
      setError(null);

      // Send authentication message
      if (authToken && userId && username) {
        const authMessage = {
          type: 'auth',
          authToken,
          userId,
          username,
        };
        console.log('Sending authentication:', authMessage);
        socket.send(JSON.stringify(authMessage));
      }

      // Request message history only if we haven't requested it before
      if (authToken && !hasRequestedHistory) {
        const historyRequest = {
          type: 'get_history',
          authToken,
          userId,
          username,
        };
        console.log('Requesting message history:', historyRequest);
        socket.send(JSON.stringify(historyRequest));
        setHasRequestedHistory(true);
      }
    };

    socket.onclose = (event) => {
      console.log('WebSocket connection closed:', event.code, event.reason);
      setIsConnected(false);

      // Only attempt to reconnect if we have an auth token and the connection wasn't closed cleanly
      if (authToken && !event.wasClean) {
        console.log('Attempting to reconnect...');
        reconnectTimeoutRef.current = window.setTimeout(connect, 3000);
      }
    };

    socket.onerror = (event) => {
      console.error('WebSocket error:', event);
      setError('WebSocket connection error');
      setIsConnected(false);
    };

    socket.onmessage = (event) => {
      try {
        console.log('Received message:', event.data);
        const data = JSON.parse(event.data);
        let newMessages: WebSocketMessage[] = [];

        switch (data.type) {
          case 'message':
            // Handle both client and server message formats
            newMessages = [
              {
                type: 'message',
                content: data.content || data.message,
                user: data.user,
                timestamp: data.timestamp,
                id: data.id,
              },
            ];
            setMessages((prev) => [...prev, ...newMessages]);
            break;
          case 'message_batch':
            // Convert server message format to client format
            newMessages = data.messages.map((msg: BatchMessage) => ({
              type: 'message',
              content: msg.message || msg.content,
              user: msg.user,
              timestamp: msg.timestamp,
              id: msg.id,
            }));
            setMessages((prev) => [...prev, ...newMessages]);
            break;
          case 'error':
            setError(data.message);
            break;
          case 'connection_count':
          case 'connection_status':
            setConnectedUsers(data.count || data.connectionCount || 0);
            break;
          case 'message_history': {
            console.log('Received message history:', data.messages);
            // Convert server message format to client format
            const historyMessages = (data.messages as ServerMessage[]).map((msg) => ({
              type: 'message',
              content: msg.message,
              user: msg.user,
              timestamp: msg.timestamp,
              id: msg.id,
            }));
            setMessages(historyMessages);
            break;
          }
          default:
            console.log('Unknown message type:', data.type);
        }
      } catch (err) {
        console.error('Failed to parse message:', err);
        setError('Failed to parse message');
      }
    };

    setWs(socket);
  }, [roomId, authToken, userId, username]);

  // Reset hasRequestedHistory when auth token changes
  useEffect(() => {
    setHasRequestedHistory(false);
  }, [authToken]);

  // Initial connection and reconnection on auth token change
  useEffect(() => {
    if (authToken) {
      console.log('Auth token changed, reconnecting...');
      connect();
    }
    return () => {
      if (reconnectTimeoutRef.current) {
        window.clearTimeout(reconnectTimeoutRef.current);
      }
    };
  }, [authToken, connect]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (reconnectTimeoutRef.current) {
        window.clearTimeout(reconnectTimeoutRef.current);
      }
      if (ws) {
        console.log('Cleaning up WebSocket connection');
        ws.close();
      }
    };
  }, []);

  const sendMessage = useCallback(
    (content: string) => {
      if (!ws || ws.readyState !== WebSocket.OPEN) {
        setError('WebSocket is not connected');
        return;
      }

      if (!authToken || !userId || !username) {
        setError('Authentication required to send messages');
        return;
      }

      try {
        const message = {
          type: 'message',
          content,
          authToken,
          userId,
          username,
        };
        console.log('Sending message:', message);
        ws.send(JSON.stringify(message));
      } catch (err) {
        console.error('Failed to send message:', err);
        setError('Failed to send message');
      }
    },
    [ws, authToken, userId, username]
  );

  const sendBatchMessage = useCallback(
    (contents: string[]) => {
      if (!ws || ws.readyState !== WebSocket.OPEN) {
        setError('WebSocket is not connected');
        return;
      }

      if (!authToken || !userId || !username) {
        setError('Authentication required to send messages');
        return;
      }

      try {
        const message = {
          type: 'message_batch',
          authToken,
          userId,
          username,
          messages: contents.map((content) => ({ content })),
        };
        console.log('Sending batch message:', message);
        ws.send(JSON.stringify(message));
      } catch (err) {
        console.error('Failed to send batch message:', err);
        setError('Failed to send batch message');
      }
    },
    [ws, authToken, userId, username]
  );

  return {
    messages,
    sendMessage,
    sendBatchMessage,
    error,
    isConnected,
    connectedUsers,
  };
}
