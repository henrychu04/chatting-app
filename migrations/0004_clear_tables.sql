-- Temporarily disable foreign key constraints
PRAGMA foreign_keys = OFF;

-- Delete all rows from messages table
DELETE FROM messages;

-- Delete all rows from users table
DELETE FROM users;

-- Re-enable foreign key constraints
PRAGMA foreign_keys = ON; 