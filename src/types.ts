import { D1Database, DurableObjectNamespace } from '@cloudflare/workers-types';

export interface Env {
  DB: D1Database;
  WEBSOCKET_HIBERNATION_SERVER: DurableObjectNamespace;
}

export interface User {
  id: string;
  username: string;
  created_at: number;
}

export interface Room {
  id: string;
  name: string;
  created_at: number;
  last_activity: number;
}

export interface Message {
  id: string;
  message: string;
  user: User;
  timestamp: number;
}

export interface TypingUser {
  user: User;
  timestamp: number;
}

export interface TypingStatus {
  type: 'typing';
  isTyping: boolean;
  user: User;
}
