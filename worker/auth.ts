import { Env } from './index';

interface User {
  id: string;
  username: string;
  email: string;
  password_hash: string;
  created_at: number;
  last_login?: number;
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

export class Auth {
  private static readonly SALT_ROUNDS = 10;

  static async generateToken(payload: { userId: string; username: string }, env: Env): Promise<string> {
    const header = { alg: 'HS256', typ: 'JWT' };
    const now = Math.floor(Date.now() / 1000);
    const exp = now + 24 * 60 * 60; // 24 hours

    const tokenPayload = {
      ...payload,
      iat: now,
      exp,
    };

    const encodedHeader = btoa(JSON.stringify(header));
    const encodedPayload = btoa(JSON.stringify(tokenPayload));
    const signature = await this.generateSignature(`${encodedHeader}.${encodedPayload}`, env);

    return `${encodedHeader}.${encodedPayload}.${signature}`;
  }

  static async verifyToken(token: string, env: Env): Promise<{ userId: string; username: string } | null> {
    try {
      const [encodedHeader, encodedPayload, signature] = token.split('.');
      const expectedSignature = await this.generateSignature(`${encodedHeader}.${encodedPayload}`, env);

      if (signature !== expectedSignature) {
        return null;
      }

      const payload = JSON.parse(atob(encodedPayload));
      const now = Math.floor(Date.now() / 1000);

      if (payload.exp < now) {
        return null;
      }

      return {
        userId: payload.userId,
        username: payload.username,
      };
    } catch {
      return null;
    }
  }

  private static async generateSignature(data: string, env: Env): Promise<string> {
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      'raw',
      encoder.encode(env.JWT_SECRET || 'your-secret-key'),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );

    const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(data));
    return btoa(String.fromCharCode(...new Uint8Array(signature)));
  }

  static async hashPassword(password: string): Promise<string> {
    const encoder = new TextEncoder();
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const key = await crypto.subtle.importKey(
      'raw',
      encoder.encode(password),
      { name: 'PBKDF2', hash: 'SHA-256' },
      false,
      ['deriveBits']
    );

    const hash = await crypto.subtle.deriveBits(
      {
        name: 'PBKDF2',
        salt,
        iterations: 100000,
        hash: 'SHA-256',
      },
      key,
      256
    );

    const hashArray = new Uint8Array(hash);
    const saltArray = new Uint8Array(salt);
    const combined = new Uint8Array(saltArray.length + hashArray.length);
    combined.set(saltArray);
    combined.set(hashArray, saltArray.length);

    // Use base64url encoding to avoid issues with special characters
    return btoa(String.fromCharCode(...combined))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
  }

  static async verifyPassword(password: string, hash: string): Promise<boolean> {
    try {
      const encoder = new TextEncoder();
      // Convert base64url back to base64
      const base64Hash = hash
        .replace(/-/g, '+')
        .replace(/_/g, '/')
        .padEnd(hash.length + ((4 - (hash.length % 4)) % 4), '=');

      const combined = new Uint8Array(
        atob(base64Hash)
          .split('')
          .map((c) => c.charCodeAt(0))
      );
      const salt = combined.slice(0, 16);
      const storedHash = combined.slice(16);

      const key = await crypto.subtle.importKey(
        'raw',
        encoder.encode(password),
        { name: 'PBKDF2', hash: 'SHA-256' },
        false,
        ['deriveBits']
      );

      const newHash = await crypto.subtle.deriveBits(
        {
          name: 'PBKDF2',
          salt,
          iterations: 100000,
          hash: 'SHA-256',
        },
        key,
        256
      );

      const newHashArray = new Uint8Array(newHash);
      return this.compareArrays(newHashArray, storedHash);
    } catch (error) {
      console.error('Password verification error:', error);
      return false;
    }
  }

  private static compareArrays(a: Uint8Array, b: Uint8Array): boolean {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (a[i] !== b[i]) return false;
    }
    return true;
  }

  static async handleSignup(env: Env, { username, password, email }: SignupRequest): Promise<Response> {
    try {
      if (!username || !password || !email) {
        return new Response(JSON.stringify({ message: 'Username, password, and email are required' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      // Validate email format
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        return new Response(JSON.stringify({ message: 'Invalid email format' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      // Validate password strength
      if (password.length < 8) {
        return new Response(JSON.stringify({ message: 'Password must be at least 8 characters long' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      // Sanitize inputs
      const sanitizedUsername = this.sanitizeInput(username);
      const sanitizedEmail = this.sanitizeInput(email);

      if (!sanitizedUsername || !sanitizedEmail) {
        return new Response(JSON.stringify({ message: 'Invalid username or email' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      // Check if username or email already exists
      const existingUser = await env.DB.prepare('SELECT * FROM users WHERE username = ? OR email = ?')
        .bind(sanitizedUsername, sanitizedEmail)
        .first();

      if (existingUser) {
        return new Response(JSON.stringify({ message: 'Username or email already exists' }), {
          status: 409,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      // Create new user with bcrypt hashed password
      const userId = `user-${Date.now()}`;
      const passwordHash = await this.hashPassword(password);
      const now = Date.now();

      await env.DB.prepare('INSERT INTO users (id, username, email, password_hash, created_at) VALUES (?, ?, ?, ?, ?)')
        .bind(userId, sanitizedUsername, sanitizedEmail, passwordHash, now)
        .run();

      // Generate JWT token
      const authToken = await this.generateToken(
        {
          userId,
          username: sanitizedUsername,
        },
        env
      );

      return new Response(
        JSON.stringify({
          token: authToken,
          user: {
            id: userId,
            username: sanitizedUsername,
          },
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    } catch (error) {
      console.error('Signup error:', error);
      return new Response(JSON.stringify({ message: 'Signup failed' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  }

  static async handleLogin(env: Env, { username, password }: LoginRequest): Promise<Response> {
    try {
      if (!username || !password) {
        return new Response(JSON.stringify({ message: 'Username and password are required' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      // Sanitize username
      const sanitizedUsername = this.sanitizeInput(username);
      if (!sanitizedUsername) {
        return new Response(JSON.stringify({ message: 'Invalid username' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      // Find user
      const user = (await env.DB.prepare('SELECT * FROM users WHERE username = ?')
        .bind(sanitizedUsername)
        .first()) as User | null;

      if (!user) {
        return new Response(JSON.stringify({ message: 'Invalid username or password' }), {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      // Verify password with bcrypt
      const isValidPassword = await this.verifyPassword(password, user.password_hash);
      if (!isValidPassword) {
        return new Response(JSON.stringify({ message: 'Invalid username or password' }), {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      // Update last login
      await env.DB.prepare('UPDATE users SET last_login = ? WHERE id = ?').bind(Date.now(), user.id).run();

      // Generate JWT token
      const authToken = await this.generateToken(
        {
          userId: user.id,
          username: user.username,
        },
        env
      );

      return new Response(
        JSON.stringify({
          token: authToken,
          user: {
            id: user.id,
            username: user.username,
          },
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    } catch (error) {
      console.error('Login error:', error);
      return new Response(JSON.stringify({ message: 'Login failed' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  }

  private static sanitizeInput(input: string): string | null {
    const sanitized = input.trim();
    if (sanitized.length === 0 || sanitized.length > 30) {
      return null;
    }
    return sanitized;
  }
}
