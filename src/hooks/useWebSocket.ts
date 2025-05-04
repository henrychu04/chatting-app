import { useEffect, useRef } from 'react';

const useWebSocket = (
  handleMessage: (event: { message: string; connections: number; id: string }) => void,
  id: string
) => {
  const socketRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    socketRef.current = new WebSocket(`/api/ws/${id}`);

    const socket = socketRef.current;

    if (socket) {
      socket.onmessage = (event) => {
        handleMessage(JSON.parse(event.data));
      };
      socket.onopen = () => {
        console.log('WebSocket opened');
      };
    }

    return () => {
      if (socket) {
        socket.close();
      }
    };
  }, []);

  const sendEvent = (event: string) => {
    const socket = socketRef.current;
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(event);
    }
  };

  return sendEvent;
};

export default useWebSocket;
