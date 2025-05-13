import { useEffect, useRef, useState, useCallback } from 'react';
import {
  WebSocketMessage,
  BatchMessage,
  WS_MESSAGE_TYPES,
  WebSocketMessageType,
  ConnectionCountMessage,
  ConnectionStatusMessage,
  ErrorMessage,
  MessageHistoryMessage,
} from '../types/websocket';
import { useAuth } from '../contexts/AuthContext';

interface Message {
  content: string;
  user: string;
  timestamp: number;
  id: string;
}

export function useWebSocket(roomId: string) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [connectionCount, setConnectionCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const ws = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<number | null>(null);
  const isConnectingRef = useRef(false);
  const { authToken, userId, username } = useAuth();

  const cleanup = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    if (ws.current) {
      ws.current.onclose = null;
      ws.current.onerror = null;
      ws.current.onmessage = null;
      ws.current.onopen = null;
      if (ws.current.readyState === WebSocket.OPEN || ws.current.readyState === WebSocket.CONNECTING) {
        ws.current.close();
      }
      ws.current = null;
    }
    isConnectingRef.current = false;
  }, []);

  const connect = useCallback(() => {
    // Prevent multiple connection attempts
    if (ws.current?.readyState === WebSocket.OPEN || isConnectingRef.current) {
      console.log('WebSocket already connected or connecting');
      return;
    }

    // Clean up any existing connection
    cleanup();

    try {
      isConnectingRef.current = true;
      const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${location.host}/ws/${roomId}`;
      console.log('Connecting to WebSocket:', wsUrl);
      const socket = new WebSocket(wsUrl);

      socket.onopen = () => {
        console.log('WebSocket connected');
        setIsConnected(true);
        setError(null);
        isConnectingRef.current = false;

        // Send authentication message if we have a token
        if (authToken && userId && username) {
          const authMessage = {
            type: WS_MESSAGE_TYPES.AUTH,
            authToken,
            userId,
            username,
          };
          socket.send(JSON.stringify(authMessage));

          // Request message history only after sending auth
          const historyMessage = {
            type: WS_MESSAGE_TYPES.GET_HISTORY,
            roomId,
            authToken,
            userId,
            username,
          };
          socket.send(JSON.stringify(historyMessage));
        }
      };

      socket.onclose = (event) => {
        console.log('WebSocket closed:', event.code, event.reason);
        setIsConnected(false);
        isConnectingRef.current = false;
        ws.current = null;

        // Only attempt to reconnect if the connection was closed unexpectedly
        if (event.code !== 1000 && !reconnectTimeoutRef.current) {
          console.log('Attempting to reconnect...');
          reconnectTimeoutRef.current = window.setTimeout(() => {
            reconnectTimeoutRef.current = null;
            connect();
          }, 3000);
        }
      };

      socket.onerror = (event) => {
        console.error('WebSocket error:', event);
        setError('Connection error. Please try again.');
        isConnectingRef.current = false;
      };

      socket.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data) as WebSocketMessageType;
          console.log('Received raw message:', event.data);
          console.log('Parsed message:', message);

          if (!message.type) {
            console.error('Message missing type:', message);
            return;
          }

          let statusMessage: ConnectionStatusMessage;
          switch (message.type) {
            case WS_MESSAGE_TYPES.AUTH_SUCCESS:
              console.log('Authentication successful:', message);
              break;
            case WS_MESSAGE_TYPES.MESSAGE:
              setMessages((prev) => [
                ...prev,
                {
                  content: message.content || message.message || '',
                  user: message.user,
                  timestamp: message.timestamp,
                  id: message.id,
                },
              ]);
              break;
            case WS_MESSAGE_TYPES.MESSAGE_BATCH:
              setMessages((prev) => [
                ...prev,
                ...(message as BatchMessage).messages.map((msg) => ({
                  content: msg.content || msg.message || '',
                  user: msg.user,
                  timestamp: msg.timestamp,
                  id: msg.id,
                })),
              ]);
              break;
            case WS_MESSAGE_TYPES.MESSAGE_HISTORY:
              console.log('Received history:', message);
              setMessages(
                (message as MessageHistoryMessage).messages.map((msg) => ({
                  content: msg.message || msg.content || '',
                  user: msg.user,
                  timestamp: msg.timestamp,
                  id: msg.id,
                }))
              );
              break;
            case WS_MESSAGE_TYPES.CONNECTION_COUNT:
              setConnectionCount((message as ConnectionCountMessage).count);
              break;
            case WS_MESSAGE_TYPES.CONNECTION_STATUS:
              console.log('Received connection status:', message);
              statusMessage = message as ConnectionStatusMessage;
              setIsConnected(true);
              setConnectionCount(statusMessage.connectionCount);
              break;
            case WS_MESSAGE_TYPES.ERROR:
              setError((message as ErrorMessage).message);
              break;
            default:
              console.warn('Unknown message type:', message.type);
          }
        } catch (err) {
          console.error('Error parsing message:', err);
          setError('Error processing message');
        }
      };

      ws.current = socket;
    } catch (err) {
      console.error('Error creating WebSocket:', err);
      setError('Failed to connect. Please try again.');
      isConnectingRef.current = false;
    }
  }, [roomId, authToken, userId, username, cleanup]);

  // Connect on mount and when auth state changes
  useEffect(() => {
    connect();
    return cleanup;
  }, [connect, cleanup]);

  const sendMessage = useCallback(
    (content: string) => {
      if (!ws.current || ws.current.readyState !== WebSocket.OPEN) {
        setError('Not connected to server');
        return;
      }

      try {
        const message: WebSocketMessage = {
          type: WS_MESSAGE_TYPES.MESSAGE,
          content,
          user: username || 'Anonymous',
          timestamp: Date.now(),
          id: String(Date.now()),
        };
        ws.current.send(JSON.stringify(message));
      } catch (err) {
        console.error('Error sending message:', err);
        setError('Failed to send message');
      }
    },
    [username]
  );

  const sendBatchMessages = useCallback(
    (contents: string[]) => {
      if (!ws.current || ws.current.readyState !== WebSocket.OPEN) {
        setError('Not connected to chat server');
        return;
      }

      const message: BatchMessage = {
        type: WS_MESSAGE_TYPES.MESSAGE_BATCH,
        messages: contents.map((content) => ({
          type: WS_MESSAGE_TYPES.MESSAGE,
          content,
          user: username || 'Anonymous',
          timestamp: Date.now(),
          id: String(Date.now() + Math.random()),
        })),
      };
      console.log('Sending batch message:', message);
      ws.current.send(JSON.stringify(message));
    },
    [username]
  );

  return {
    messages,
    isConnected,
    connectionCount,
    error,
    sendMessage,
    sendBatchMessages,
  };
}
