import { Database } from '../db';
import { rooms, users } from '../db/schema';
import { eq } from 'drizzle-orm';
import { generateUserId, generateRoomId } from './auth';
import { User, Room } from '../types';

// User operations
export async function createUser(
  db: Database,
  username: string,
  options?: {
    email?: string;
    passwordHash?: string;
  }
): Promise<User> {
  const id = generateUserId();
  const now = new Date();

  await db.insert(users).values({
    id,
    username,
    email: options?.email,
    passwordHash: options?.passwordHash,
    createdAt: now,
  });

  return { id, username, created_at: now.getTime() };
}

export async function getUserByUsername(db: Database, username: string): Promise<User | null> {
  const result = await db.select().from(users).where(eq(users.username, username)).get();
  if (!result) return null;

  return {
    id: result.id,
    username: result.username,
    created_at: result.createdAt.getTime(),
  };
}

// Room operations
export async function createRoom(db: Database, name: string): Promise<Room> {
  const id = generateRoomId();
  const now = new Date();

  await db.insert(rooms).values({
    id,
    name,
    createdAt: now,
    lastActivity: now,
  });

  return {
    id,
    name,
    created_at: now.getTime(),
    last_activity: now.getTime(),
  };
}

export async function getRoom(db: Database, roomId: string): Promise<Room | null> {
  const result = await db.select().from(rooms).where(eq(rooms.id, roomId)).get();
  if (!result) return null;

  return {
    id: result.id,
    name: result.name,
    created_at: result.createdAt.getTime(),
    last_activity: result.lastActivity.getTime(),
  };
}

export async function getRooms(db: Database, limit: number = 50, offset: number = 0): Promise<Room[]> {
  const result = await db.select().from(rooms).orderBy(rooms.lastActivity).limit(limit).offset(offset).all();

  return result.map((room) => ({
    id: room.id,
    name: room.name,
    created_at: room.createdAt.getTime(),
    last_activity: room.lastActivity.getTime(),
  }));
}

export async function updateRoomActivity(db: Database, roomId: string): Promise<void> {
  await db
    .update(rooms)
    .set({
      lastActivity: new Date(),
    })
    .where(eq(rooms.id, roomId));
}
