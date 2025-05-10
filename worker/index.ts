import { Auth } from './auth';
import sanitizeHtml from 'sanitize-html';
import { createDb } from '../src/db';
import { rooms } from '../src/db/schema';
import { eq } from 'drizzle-orm';

export interface Env {
  WEBSOCKET_HIBERNATION_SERVER: DurableObjectNamespace;
  DB: D1Database;
  JWT_SECRET: string;
  ASSETS: {
    fetch: (request: Request) => Promise<Response>;
  };
}

// Constants
const MAX_HISTORY = 100;
const MAX_MESSAGE_LENGTH = 1000;
const MAX_USERNAME_LENGTH = 30;
const MAX_CONNECTIONS_PER_IP = 5;
const PING_INTERVAL = 30000; // 30 seconds
const PONG_TIMEOUT = 10000; // 10 seconds
const MAX_RETRY_ATTEMPTS = 3;

// Sanitization options
const sanitizeOptions = {
  allowedTags: [], // No HTML tags allowed
  allowedAttributes: {}, // No attributes allowed
  allowedIframeHostnames: [], // No iframes allowed
  disallowedTagsMode: 'discard' as const,
  allowedSchemes: [],
  allowedSchemesByTag: {},
  allowedSchemesAppliedToAttributes: [],
  allowProtocolRelative: false,
  enforceHtmlBoundary: true,
};

interface Message {
  message: string;
  user: string;
  id: string;
  timestamp: number;
}

interface ExtendedWebSocket extends WebSocket {
  clientIP: string;
  lastPing: number;
  isAlive: boolean;
  retryCount: number;
}

interface SignupRequest {
  username: string;
  password: string;
  email: string;
}

interface LoginRequest {
  username: string;
  password: string;
}

interface RoomRequest {
  name: string;
}

// Helper function to sanitize input
function sanitizeInput(input: string): string {
  return sanitizeHtml(input, sanitizeOptions).trim();
}

// Helper function to validate message
function validateMessage(message: string, user: string): { valid: boolean; error?: string } {
  try {
    if (!message || !user) {
      return { valid: false, error: 'Message and user are required' };
    }

    if (message.length > MAX_MESSAGE_LENGTH) {
      return { valid: false, error: `Message too long (max ${MAX_MESSAGE_LENGTH} characters)` };
    }

    if (user.length > MAX_USERNAME_LENGTH) {
      return { valid: false, error: `Username too long (max ${MAX_USERNAME_LENGTH} characters)` };
    }

    // Sanitize both message and user
    const sanitizedMessage = sanitizeInput(message);
    const sanitizedUser = sanitizeInput(user);

    if (sanitizedMessage !== message || sanitizedUser !== user) {
      return { valid: false, error: 'Invalid characters detected' };
    }

    return { valid: true };
  } catch (error) {
    console.error('Message validation error:', error);
    return { valid: false, error: 'Internal validation error' };
  }
}

// Add handleApiRequest function
async function handleApiRequest(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname;
  const db = createDb(env.DB);

  // Auth endpoints
  if (path === '/api/signup' && request.method === 'POST') {
    try {
      const signupData = (await request.json()) as SignupRequest;
      return await Auth.handleSignup(env, signupData);
    } catch {
      return new Response(JSON.stringify({ message: 'Invalid request format' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  }

  if (path === '/api/login' && request.method === 'POST') {
    try {
      const loginData = (await request.json()) as LoginRequest;
      return await Auth.handleLogin(env, loginData);
    } catch {
      return new Response(JSON.stringify({ message: 'Invalid request format' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  }

  // Room endpoints
  if (path === '/api/rooms' && request.method === 'GET') {
    const roomsList = await db.select().from(rooms).orderBy(rooms.lastActivity);
    return new Response(JSON.stringify(roomsList), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (path === '/api/rooms' && request.method === 'POST') {
    const { name } = (await request.json()) as RoomRequest;
    const roomId = `room-${Date.now()}`;
    const now = new Date();

    const [newRoom] = await db
      .insert(rooms)
      .values({
        id: roomId,
        name,
        createdAt: now,
        lastActivity: now,
      })
      .returning();

    return new Response(JSON.stringify(newRoom), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  return new Response('Not found', { status: 404 });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    // Handle CORS preflight requests
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        },
      });
    }

    const url = new URL(request.url);
    const path = url.pathname;

    // Handle API routes
    if (path.startsWith('/api/')) {
      // Add CORS headers to API responses
      const response = await handleApiRequest(request, env);
      const headers = new Headers(response.headers);
      headers.set('Access-Control-Allow-Origin', '*');
      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers,
      });
    }

    // Handle WebSocket connections
    if (path.startsWith('/ws')) {
      // Extract room ID from path or query parameter
      let roomId = 'default';
      if (path === '/ws') {
        roomId = url.searchParams.get('room') || 'default';
      } else {
        // Handle /ws/{roomId} format
        const pathParts = path.split('/');
        if (pathParts.length > 2) {
          roomId = pathParts[2];
        }
      }

      const id = env.WEBSOCKET_HIBERNATION_SERVER.idFromName(roomId);
      const stub = env.WEBSOCKET_HIBERNATION_SERVER.get(id);

      return stub.fetch(request);
    }

    // Serve static content
    try {
      // Try to serve the requested file
      const response = await env.ASSETS.fetch(request);
      if (response.status === 404) {
        // If file not found, serve index.html
        return env.ASSETS.fetch(new Request(new URL('/index.html', request.url)));
      }
      return response;
    } catch {
      // If there's an error, serve index.html
      return env.ASSETS.fetch(new Request(new URL('/index.html', request.url)));
    }
  },
};

export class WebSocketHibernationServer implements DurableObject {
  private messageHistory: Message[] = [];
  private messageQueue: Message[] = [];
  private batchTimeout: ReturnType<typeof setTimeout> | null = null;
  private userMessageCounts: Map<string, { count: number; lastReset: number }> = new Map();
  private state: DurableObjectState;
  private ipConnections: Map<string, number> = new Map();
  private healthCheckInterval: ReturnType<typeof setTimeout> | null = null;
  private typingUsers: Map<string, number> = new Map();
  private clients: Map<string, WebSocket> = new Map();
  private env: Env;
  private db: ReturnType<typeof createDb>;

  constructor(state: DurableObjectState, env: Env) {
    this.state = state;
    this.env = env;
    this.db = createDb(env.DB);
    this.initializeState();
  }

  private async initializeState() {
    const stored = await this.state.storage.get('messageHistory');
    if (stored) {
      this.messageHistory = stored as Message[];
    }
  }

  private async persistState() {
    await this.state.storage.put('messageHistory', this.messageHistory);
  }

  private broadcast(message: string): void {
    this.clients.forEach((client, id) => {
      if (client.readyState === WebSocket.OPEN) {
        try {
          client.send(message);
        } catch (error) {
          console.error('Error broadcasting message to client:', id, error);
        }
      }
    });
  }

  private broadcastBatch(messages: Message[]): void {
    if (messages.length === 0) return;

    const batchMessage = JSON.stringify({
      type: 'message_batch',
      messages: messages.map((msg) => ({
        type: 'message',
        ...msg,
      })),
    });

    this.broadcast(batchMessage);
  }

  private broadcastConnectionCount(): void {
    const count = this.clients.size;
    const message = JSON.stringify({
      type: 'connection_count',
      count: count,
    });
    this.broadcast(message);
  }

  private async updateRoomActivity(roomId: string): Promise<void> {
    await this.db
      .update(rooms)
      .set({
        lastActivity: new Date(),
      })
      .where(eq(rooms.id, roomId));
  }

  async fetch(request: Request): Promise<Response> {
    if (request.headers.get('Upgrade') !== 'websocket') {
      return new Response('Expected WebSocket', { status: 400 });
    }

    const clientIP = request.headers.get('CF-Connecting-IP') || 'unknown';
    const currentConnections = this.ipConnections.get(clientIP) || 0;

    if (currentConnections >= MAX_CONNECTIONS_PER_IP) {
      return new Response('Too many connections from this IP', { status: 429 });
    }

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);

    this.state.acceptWebSocket(server);
    this.clients.set(server.toString(), server);
    this.ipConnections.set(clientIP, currentConnections + 1);

    // Send initial connection success message with current connection count
    server.send(
      JSON.stringify({
        type: 'connection_status',
        status: 'connected',
        message: 'Successfully connected to chat room',
        connectionCount: this.clients.size,
      })
    );

    // Broadcast updated connection count to all clients
    this.broadcastConnectionCount();

    if (!this.healthCheckInterval) {
      this.startHealthCheck();
    }

    return new Response(null, {
      status: 101,
      webSocket: client,
    });
  }

  async webSocketMessage(ws: WebSocket, message: ArrayBuffer | string): Promise<void> {
    if (typeof message !== 'string') {
      return;
    }

    try {
      const data = JSON.parse(message);

      // Handle authentication
      if (data.type === 'auth') {
        const auth = await Auth.verifyToken(data.authToken, this.env);
        if (!auth || auth.userId !== data.userId || auth.username !== data.username) {
          ws.send(JSON.stringify({ type: 'error', message: 'Invalid authentication' }));
          return;
        }
        (ws as ExtendedWebSocket).clientIP = data.userId;
        ws.send(JSON.stringify({ type: 'auth_success', username: data.username }));
        return;
      }

      // Handle ping messages
      if (data.type === 'ping') {
        (ws as ExtendedWebSocket).lastPing = Date.now();
        ws.send(JSON.stringify({ type: 'pong' }));
        return;
      }

      // Handle typing indicator
      if (data.type === 'typing') {
        const username = data.user;
        this.typingUsers.set(username, Date.now());
        this.broadcast(JSON.stringify({ type: 'typing', user: username }));
        return;
      }

      // Handle regular messages
      if (data.type === 'message') {
        const content = data.content || data.message;
        const user = data.username || data.user;

        if (!content || !user) {
          ws.send(JSON.stringify({ type: 'error', message: 'Message and user are required' }));
          return;
        }

        const validation = validateMessage(content, user);

        if (!validation.valid) {
          ws.send(JSON.stringify({ type: 'error', message: validation.error }));
          return;
        }

        // Check message rate limit
        const userCount = this.userMessageCounts.get(user) || { count: 0, lastReset: Date.now() };
        if (Date.now() - userCount.lastReset > 60000) {
          userCount.count = 0;
          userCount.lastReset = Date.now();
        }

        if (userCount.count >= 10) {
          ws.send(JSON.stringify({ type: 'error', message: 'Message rate limit exceeded' }));
          return;
        }

        userCount.count++;
        this.userMessageCounts.set(user, userCount);

        const messageId = `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        const timestamp = Date.now();

        const newMessage: Message = {
          message: content,
          user,
          id: messageId,
          timestamp,
        };

        this.messageQueue.push(newMessage);

        if (this.batchTimeout === null) {
          this.batchTimeout = setTimeout(() => {
            this.broadcastBatch(this.messageQueue);
            this.messageQueue = [];
            this.batchTimeout = null;
          }, 100) as unknown as ReturnType<typeof setTimeout>;
        }

        // Update room activity
        const roomId = this.state.id.toString();
        await this.updateRoomActivity(roomId);
      }
    } catch (error) {
      console.error('Error processing message:', error);
      ws.send(JSON.stringify({ type: 'error', message: 'Invalid message format' }));
    }
  }

  webSocketClose(ws: WebSocket): void {
    this.clients.delete(ws.toString());
    const clientIP = (ws as ExtendedWebSocket).clientIP || 'unknown';
    const currentConnections = this.ipConnections.get(clientIP) || 0;
    if (currentConnections > 0) {
      this.ipConnections.set(clientIP, currentConnections - 1);
    }
    // Broadcast updated connection count when a client disconnects
    this.broadcastConnectionCount();
  }

  webSocketError(ws: WebSocket, error: unknown): void {
    console.error('WebSocket error:', error);
    this.clients.delete(ws.toString());
  }

  private startHealthCheck() {
    this.healthCheckInterval = setInterval(() => {
      const now = Date.now();
      for (const ws of this.clients.values()) {
        const extendedWs = ws as ExtendedWebSocket;
        if (now - extendedWs.lastPing > PONG_TIMEOUT) {
          if (extendedWs.retryCount >= MAX_RETRY_ATTEMPTS) {
            ws.close(1000, 'Connection timeout');
          } else {
            extendedWs.retryCount++;
            try {
              ws.send(JSON.stringify({ type: 'ping' }));
            } catch (error) {
              console.error('Error sending ping:', error);
              ws.close(1000, 'Connection error');
            }
          }
        }
      }
    }, PING_INTERVAL) as unknown as number;
  }
}
