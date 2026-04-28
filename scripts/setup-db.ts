import postgres from 'postgres';

const connectionString = process.env.SUPABASE_DB_URL;

if (!connectionString) {
  console.error('FATAL: SUPABASE_DB_URL environment variable is required');
  process.exit(1);
}

const sql = postgres(connectionString, { prepare: false });

async function setupDatabase() {
  console.log('Setting up Agent Cortex database...');

  // Enable pgvector if not already enabled
  await sql`CREATE EXTENSION IF NOT EXISTS vector`;
  console.log('pgvector extension enabled');

  // Create learnings table
  await sql`
    CREATE TABLE IF NOT EXISTS learnings (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      pattern TEXT NOT NULL,
      rationale TEXT,
      source_type TEXT NOT NULL DEFAULT 'observation',
      source_ref TEXT,
      project TEXT NOT NULL DEFAULT 'global',
      codebase_areas TEXT[] DEFAULT '{}',
      tags TEXT[] DEFAULT '{}',
      examples JSONB DEFAULT '{}',
      confidence INT NOT NULL DEFAULT 1,
      active BOOLEAN NOT NULL DEFAULT true,
      deprecated_reason TEXT,
      embedding VECTOR(1536),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
  console.log('learnings table created');

  // Create indexes
  await sql`
    CREATE INDEX IF NOT EXISTS idx_learnings_embedding
    ON learnings USING hnsw (embedding vector_cosine_ops)
    WITH (m = 16, ef_construction = 64)
  `;

  await sql`CREATE INDEX IF NOT EXISTS idx_learnings_project ON learnings (project)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_learnings_areas ON learnings USING gin (codebase_areas)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_learnings_tags ON learnings USING gin (tags)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_learnings_active ON learnings (active)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_learnings_confidence ON learnings (confidence DESC)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_learnings_source_type ON learnings (source_type)`;

  // Full-text search column (generated from pattern + rationale)
  // Use DO block to add column idempotently
  await sql`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'learnings' AND column_name = 'search_vector'
      ) THEN
        ALTER TABLE learnings ADD COLUMN search_vector tsvector
          GENERATED ALWAYS AS (
            setweight(to_tsvector('english', coalesce(pattern, '')), 'A') ||
            setweight(to_tsvector('english', coalesce(rationale, '')), 'B')
          ) STORED;
      END IF;
    END $$
  `;

  await sql`
    CREATE INDEX IF NOT EXISTS idx_learnings_fts
    ON learnings USING gin (search_vector)
  `;
  console.log('learnings indexes created');

  // Auto-update timestamp trigger
  await sql`
    CREATE OR REPLACE FUNCTION update_learnings_updated_at()
    RETURNS TRIGGER AS $$
    BEGIN
      NEW.updated_at = NOW();
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql
  `;

  // Drop and recreate trigger to avoid "already exists" errors on re-run
  await sql`DROP TRIGGER IF EXISTS learnings_updated_at ON learnings`;
  await sql`
    CREATE TRIGGER learnings_updated_at
      BEFORE UPDATE ON learnings
      FOR EACH ROW EXECUTE FUNCTION update_learnings_updated_at()
  `;
  console.log('learnings updated_at trigger created');

  // Create learning_links table
  await sql`
    CREATE TABLE IF NOT EXISTS learning_links (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      source_id UUID NOT NULL REFERENCES learnings(id) ON DELETE CASCADE,
      target_id UUID NOT NULL REFERENCES learnings(id) ON DELETE CASCADE,
      relationship TEXT NOT NULL DEFAULT 'relates_to',
      note TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(source_id, target_id, relationship)
    )
  `;
  console.log('learning_links table created');

  await sql`
    CREATE INDEX IF NOT EXISTS idx_learning_links_source ON learning_links (source_id)
  `;
  await sql`
    CREATE INDEX IF NOT EXISTS idx_learning_links_target ON learning_links (target_id)
  `;
  console.log('learning_links indexes created');

  // Create todos table
  await sql`
    CREATE TABLE IF NOT EXISTS todos (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      text TEXT NOT NULL,
      project TEXT NOT NULL DEFAULT 'global',
      priority INT NOT NULL DEFAULT 2 CHECK (priority >= 1 AND priority <= 3),
      status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'done', 'cancelled')),
      related_learning_id UUID REFERENCES learnings(id) ON DELETE SET NULL,
      tags TEXT[] DEFAULT '{}',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      completed_at TIMESTAMPTZ,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
  console.log('todos table created');

  await sql`CREATE INDEX IF NOT EXISTS idx_todos_status ON todos (status)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_todos_project ON todos (project)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_todos_created_at ON todos (created_at DESC)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_todos_tags ON todos USING gin (tags)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_todos_priority ON todos (priority)`;
  console.log('todos indexes created');

  // Reuse the same updated_at logic for todos
  await sql`DROP TRIGGER IF EXISTS todos_updated_at ON todos`;
  await sql`
    CREATE TRIGGER todos_updated_at
      BEFORE UPDATE ON todos
      FOR EACH ROW EXECUTE FUNCTION update_learnings_updated_at()
  `;
  console.log('todos updated_at trigger created');

  console.log('Agent Cortex database setup complete');
  await sql.end();
}

setupDatabase().catch((err) => {
  console.error('Database setup failed:', err);
  process.exit(1);
});
