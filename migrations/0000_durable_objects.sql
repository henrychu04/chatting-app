-- Create Durable Objects namespace
CREATE TABLE IF NOT EXISTS _durable_objects (
  id TEXT PRIMARY KEY,
  data BLOB,
  created_at INTEGER,
  updated_at INTEGER
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_durable_objects_updated_at ON _durable_objects(updated_at); 