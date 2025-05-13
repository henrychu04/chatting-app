// WebSocket message types
export interface BaseMessage {
  type: (typeof WS_MESSAGE_TYPES)[keyof typeof WS_MESSAGE_TYPES];
}

export interface WebSocketMessage extends BaseMessage {
  type: typeof WS_MESSAGE_TYPES.MESSAGE;
  content?: string;
  message?: string;
  user: string;
  timestamp: number;
  id: string;
}

export interface ServerMessage {
  message: string;
  user: string;
  timestamp: number;
  id: string;
}

export interface BatchMessage extends BaseMessage {
  type: typeof WS_MESSAGE_TYPES.MESSAGE_BATCH;
  messages: WebSocketMessage[];
}

// WebSocket message type constants
export const WS_MESSAGE_TYPES = {
  MESSAGE: 'message',
  MESSAGE_BATCH: 'message_batch',
  AUTH: 'auth',
  AUTH_SUCCESS: 'auth_success',
  GET_HISTORY: 'get_history',
  MESSAGE_HISTORY: 'message_history',
  CONNECTION_COUNT: 'connection_count',
  CONNECTION_STATUS: 'connection_status',
  ERROR: 'error',
  TYPING: 'typing',
  PING: 'ping',
  PONG: 'pong',
} as const;

// WebSocket message interfaces
export interface AuthMessage extends BaseMessage {
  type: typeof WS_MESSAGE_TYPES.AUTH;
  authToken: string;
  userId: string;
  username: string;
}

export interface AuthSuccessMessage extends BaseMessage {
  type: typeof WS_MESSAGE_TYPES.AUTH_SUCCESS;
  username: string;
}

export interface GetHistoryMessage extends BaseMessage {
  type: typeof WS_MESSAGE_TYPES.GET_HISTORY;
  authToken: string | null;
  userId: string | null;
  username: string | null;
}

export interface ConnectionCountMessage extends BaseMessage {
  type: typeof WS_MESSAGE_TYPES.CONNECTION_COUNT;
  count: number;
}

export interface ConnectionStatusMessage extends BaseMessage {
  type: typeof WS_MESSAGE_TYPES.CONNECTION_STATUS;
  status: string;
  message: string;
  connectionCount: number;
}

export interface ErrorMessage extends BaseMessage {
  type: typeof WS_MESSAGE_TYPES.ERROR;
  message: string;
}

export interface MessageHistoryMessage extends BaseMessage {
  type: typeof WS_MESSAGE_TYPES.MESSAGE_HISTORY;
  messages: WebSocketMessage[];
}

export interface TypingMessage extends BaseMessage {
  type: typeof WS_MESSAGE_TYPES.TYPING;
  user: string;
}

export interface PingMessage extends BaseMessage {
  type: typeof WS_MESSAGE_TYPES.PING;
}

export interface PongMessage extends BaseMessage {
  type: typeof WS_MESSAGE_TYPES.PONG;
}

export type WebSocketMessageType =
  | WebSocketMessage
  | BatchMessage
  | AuthMessage
  | AuthSuccessMessage
  | GetHistoryMessage
  | ConnectionCountMessage
  | ConnectionStatusMessage
  | ErrorMessage
  | MessageHistoryMessage
  | TypingMessage
  | PingMessage
  | PongMessage;
