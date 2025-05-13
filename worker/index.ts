import { Auth } from './auth';
import sanitizeHtml from 'sanitize-html';
import { createDb } from '../src/db';
import { rooms, messages, users } from '../src/db/schema';
import { eq, desc } from 'drizzle-orm';
import { WebSocketMessage, WS_MESSAGE_TYPES, WebSocketMessageType } from '../src/types/websocket';
import { isbot } from 'isbot';

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
const MAX_CONNECTIONS_PER_IP = 20;
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

    // Check for bot traffic
    const userAgent = request.headers.get('user-agent') || '';
    if (isbot(userAgent)) {
      return new Response('Bot traffic not allowed', { status: 403 });
    }

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
      let roomId = 'main';
      if (path === '/ws') {
        roomId = url.searchParams.get('room') || 'main';
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
  private messageQueue: WebSocketMessage[] = [];
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

  private broadcastBatch(messages: WebSocketMessage[]): void {
    if (messages.length === 0) return;

    // Send message batch to all clients
    this.broadcast(
      JSON.stringify({
        type: WS_MESSAGE_TYPES.MESSAGE_BATCH,
        messages: messages.map((msg) => ({
          content: msg.content,
          user: msg.user,
          timestamp: msg.timestamp,
          id: msg.id,
        })),
      })
    );
  }

  private broadcastConnectionCount(): void {
    const count = this.clients.size;
    const message = JSON.stringify({
      type: WS_MESSAGE_TYPES.CONNECTION_COUNT,
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

  private async getMessageHistory(ws: WebSocket): Promise<void> {
    const roomId = this.state.id.toString();
    const recentMessages = await this.db
      .select({
        id: messages.id,
        content: messages.content,
        createdAt: messages.createdAt,
        username: users.username,
      })
      .from(messages)
      .leftJoin(users, eq(messages.userId, users.id))
      .where(eq(messages.roomId, roomId))
      .orderBy(desc(messages.createdAt))
      .limit(MAX_HISTORY);

    if (recentMessages.length > 0) {
      const formattedMessages = recentMessages.map((msg) => ({
        type: WS_MESSAGE_TYPES.MESSAGE,
        message: msg.content,
        user: msg.username,
        id: msg.id,
        timestamp: msg.createdAt,
      }));

      ws.send(
        JSON.stringify({
          type: WS_MESSAGE_TYPES.MESSAGE_HISTORY,
          messages: formattedMessages,
        })
      );
    }
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
        type: WS_MESSAGE_TYPES.CONNECTION_STATUS,
        status: 'connected',
        message: 'Successfully connected to chat room',
        connectionCount: this.clients.size,
      })
    );

    // Send message history
    await this.getMessageHistory(server);

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
      const data = JSON.parse(message) as WebSocketMessageType;

      // Handle authentication
      if (data.type === WS_MESSAGE_TYPES.AUTH) {
        const auth = await Auth.verifyToken(data.authToken, this.env);
        if (!auth || auth.userId !== data.userId || auth.username !== data.username) {
          ws.send(JSON.stringify({ type: WS_MESSAGE_TYPES.ERROR, message: 'Invalid authentication' }));
          return;
        }
        (ws as ExtendedWebSocket).clientIP = data.userId;
        ws.send(JSON.stringify({ type: WS_MESSAGE_TYPES.AUTH_SUCCESS, username: data.username }));
        return;
      }

      // Handle message history requests
      if (data.type === WS_MESSAGE_TYPES.GET_HISTORY) {
        await this.getMessageHistory(ws);
        return;
      }

      // Handle ping messages
      if (data.type === WS_MESSAGE_TYPES.PING) {
        (ws as ExtendedWebSocket).lastPing = Date.now();
        ws.send(JSON.stringify({ type: WS_MESSAGE_TYPES.PONG }));
        return;
      }

      // Handle typing indicator
      if (data.type === WS_MESSAGE_TYPES.TYPING) {
        const username = data.user;
        this.typingUsers.set(username, Date.now());
        this.broadcast(JSON.stringify({ type: WS_MESSAGE_TYPES.TYPING, user: username }));
        return;
      }

      // Handle regular messages
      if (data.type === WS_MESSAGE_TYPES.MESSAGE) {
        const content = data.content;
        const user = data.user;

        if (!content || !user) {
          ws.send(JSON.stringify({ type: WS_MESSAGE_TYPES.ERROR, message: 'Message and user are required' }));
          return;
        }

        const validation = validateMessage(content, user);

        if (!validation.valid) {
          ws.send(JSON.stringify({ type: WS_MESSAGE_TYPES.ERROR, message: validation.error }));
          return;
        }

        // Check message rate limit
        const userCount = this.userMessageCounts.get(user) || { count: 0, lastReset: Date.now() };
        if (Date.now() - userCount.lastReset > 60000) {
          userCount.count = 0;
          userCount.lastReset = Date.now();
        }

        if (userCount.count >= 10) {
          ws.send(JSON.stringify({ type: WS_MESSAGE_TYPES.ERROR, message: 'Message rate limit exceeded' }));
          return;
        }

        userCount.count++;
        this.userMessageCounts.set(user, userCount);

        const messageId = `msg-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
        const timestamp = Date.now();
        const roomId = this.state.id.toString();

        // Ensure user exists in database
        const existingUser = await this.db.select().from(users).where(eq(users.username, user)).limit(1);

        let userId: string;
        if (existingUser.length === 0) {
          // Create new user if doesn't exist
          const newUser = await this.db
            .insert(users)
            .values({
              id: `user-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`,
              username: user,
              createdAt: new Date(timestamp),
            })
            .returning();

          if (!newUser || newUser.length === 0) {
            throw new Error('Failed to create user');
          }

          userId = newUser[0].id;
        } else {
          userId = existingUser[0].id;
        }

        // Ensure room exists in database
        const existingRoom = await this.db.select().from(rooms).where(eq(rooms.id, roomId)).limit(1);

        if (existingRoom.length === 0) {
          // Create new room if doesn't exist
          const newRoom = await this.db
            .insert(rooms)
            .values({
              id: roomId,
              name: `Room ${roomId}`,
              createdAt: new Date(timestamp),
              lastActivity: new Date(timestamp),
            })
            .returning();

          if (!newRoom || newRoom.length === 0) {
            throw new Error('Failed to create room');
          }
        }

        // Store message in database
        await this.db.insert(messages).values({
          id: messageId,
          roomId,
          userId,
          content,
          createdAt: new Date(timestamp),
        });

        const newMessage: WebSocketMessage = {
          type: WS_MESSAGE_TYPES.MESSAGE,
          content,
          user,
          timestamp,
          id: String(messageId),
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
        await this.updateRoomActivity(roomId);
      }
    } catch (error) {
      console.error('Error processing message:', error);
      ws.send(JSON.stringify({ type: WS_MESSAGE_TYPES.ERROR, message: 'Invalid message format' }));
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
              ws.send(JSON.stringify({ type: WS_MESSAGE_TYPES.PING }));
            } catch (error) {
              console.error('Error sending ping:', error);
              ws.close(1000, 'Connection error');
            }
          }
        }
      }
    }, PING_INTERVAL) as unknown as ReturnType<typeof setTimeout>;
  }
}
