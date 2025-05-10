interface MessageProps {
  message: {
    type: string;
    content?: string;
    user?: string;
    timestamp?: number;
    error?: string;
  };
  isOwnMessage: boolean;
}

const Message = ({ message, isOwnMessage }: MessageProps) => {
  return (
    <div className={`flex flex-col ${isOwnMessage ? 'items-end' : 'items-start'}`}>
      <div className="flex items-baseline">
        <span className="font-medium text-gray-900">{message.user}</span>
        <span className="ml-2 text-sm text-gray-500">
          {message.timestamp ? new Date(message.timestamp).toLocaleTimeString() : ''}
        </span>
      </div>
      <p className="text-gray-700">{message.content}</p>
    </div>
  );
};

export default Message;
