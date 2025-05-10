import { Database } from '../db';
import { rooms, users } from '../db/schema';
import { eq } from 'drizzle-orm';
import { generateUserId, generateRoomId } from './auth';
import { User, Room } from '../types';

// User operations
export async function createUser(db: Database, username: string): Promise<User> {
  const id = generateUserId();
  const now = Date.now();

  await db.insert(users).values({
    id,
    username,
    createdAt: now,
  });

  return { id, username, created_at: now };
}

export async function getUserByUsername(db: Database, username: string): Promise<User | null> {
  const result = await db.select().from(users).where(eq(users.username, username)).get();
  return result || null;
}

// Room operations
export async function createRoom(db: Database, name: string): Promise<Room> {
  const id = generateRoomId();
  const now = Date.now();

  await db.insert(rooms).values({
    id,
    name,
    createdAt: now,
    lastActivity: now,
  });

  return { id, name, created_at: now, last_activity: now };
}

export async function getRoom(db: Database, roomId: string): Promise<Room | null> {
  const result = await db.select().from(rooms).where(eq(rooms.id, roomId)).get();
  return result || null;
}

export async function getRooms(db: Database, limit: number = 50, offset: number = 0): Promise<Room[]> {
  const result = await db.select().from(rooms).orderBy(rooms.lastActivity).limit(limit).offset(offset).all();

  return result;
}

export async function updateRoomActivity(db: Database, roomId: string): Promise<void> {
  await db
    .update(rooms)
    .set({
      lastActivity: Date.now(),
    })
    .where(eq(rooms.id, roomId));
}
