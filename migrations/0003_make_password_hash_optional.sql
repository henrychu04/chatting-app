-- Temporarily disable foreign key constraints
PRAGMA foreign_keys = OFF;

-- Make password_hash column optional
CREATE TABLE users_new (
    id TEXT PRIMARY KEY,
    username TEXT NOT NULL UNIQUE,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    created_at INTEGER NOT NULL DEFAULT (unixepoch()),
    last_login INTEGER
);

-- Create temporary messages table
CREATE TABLE messages_new (
    id TEXT PRIMARY KEY NOT NULL,
    room_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

-- Copy existing data with default values for NULL fields
INSERT INTO users_new (id, username, email, password_hash, created_at, last_login)
SELECT 
    id,
    username,
    COALESCE(email, 'user_' || id || '@example.com') as email,
    COALESCE(password_hash, 'default_hash_' || id) as password_hash,
    COALESCE(created_at, unixepoch()) as created_at,
    last_login
FROM users;

-- Copy messages data
INSERT INTO messages_new
SELECT * FROM messages;

-- Drop old tables
DROP TABLE messages;
DROP TABLE users;

-- Rename new tables to original names
ALTER TABLE users_new RENAME TO users;
ALTER TABLE messages_new RENAME TO messages;

-- Recreate indexes
CREATE UNIQUE INDEX users_username_idx ON users(username);
CREATE UNIQUE INDEX users_email_idx ON users(email);

-- Recreate foreign key constraints
CREATE INDEX messages_room_id_idx ON messages(room_id);
CREATE INDEX messages_user_id_idx ON messages(user_id);

-- Re-enable foreign key constraints
PRAGMA foreign_keys = ON; 