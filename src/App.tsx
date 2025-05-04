import { useState } from 'react';
import './App.css';
import useWebSocket from './hooks/useWebSocket';

const App = () => {
  const [currentMessage, setCurrentMessage] = useState<string>('');
  const [messages, setMessages] = useState<string[]>([]);

  const sendMessage = useWebSocket((message: { message: string; connections: number; id: string }) => {
    console.log(message, 'WebSocket message received');
    setMessages((prevMessages) => [...prevMessages, message.message]);
  }, 'master');

  return (
    <>
      {messages.map((message, index) => {
        return <div key={index}>{message}</div>;
      })}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          sendMessage(currentMessage);
          setCurrentMessage('');
        }}
      >
        <input
          onChange={(input) => {
            setCurrentMessage(input.target.value);
          }}
          value={currentMessage}
        />
        <button type="submit">Send</button>
      </form>
    </>
  );
};

export default App;
