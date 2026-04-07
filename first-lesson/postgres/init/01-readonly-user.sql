-- Read-only user for MCP server access
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'chatreader') THEN
    CREATE ROLE chatreader WITH LOGIN PASSWORD 'chatreader_readonly';
  END IF;
END
$$;

GRANT CONNECT ON DATABASE chatdb TO chatreader;
GRANT USAGE ON SCHEMA public TO chatreader;

-- Grant SELECT on all existing tables
GRANT SELECT ON ALL TABLES IN SCHEMA public TO chatreader;

-- Grant SELECT on all future tables
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO chatreader;
