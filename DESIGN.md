# Agent Cortex - Design Document

## Vision

A persistent memory system for AI agents (Claude Code, Codex) that captures learnings,
patterns, conventions, and mistakes discovered during development work. Unlike Open Brain
(which captures human thoughts), Agent Cortex is the agent's own institutional knowledge
that survives context switches, session boundaries, and compaction cycles.

## Core Concept: Learnings

A **learning** is a piece of knowledge the agent should remember and apply in future work.
Examples:
- "In the craft-ai-agents repo, repository layer classes must extend BaseRepository and
  use the transaction manager pattern, not raw SQL"
- "PR #342 feedback: transformer tests need to mock the external API client, not call it directly"
- "When working with the speckit templates, YAML anchors are preferred over duplication"

When the source of truth is already a durable file, the learning should normally be a
**pointer learning** rather than a duplicate summary. The file remains canonical; Cortex
stores the retrieval hook, metadata, confidence, and source reference.

Each learning has:
- The pattern/rule itself
- Why it matters (rationale)
- Where it came from (source)
- What area of code it applies to
- Confidence level (reinforced over time)

## Architecture

Same pattern as Open Brain:
- **MCP Server** via `@modelcontextprotocol/sdk` + stdio transport
- **Supabase PostgreSQL** + pgvector (same DB instance, different tables)
- **OpenAI** text-embedding-3-small for semantic search
- **Claude Sonnet** via Bedrock for metadata extraction

## Database Schema

### `learnings` table

```sql
CREATE TABLE learnings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Core content
  pattern TEXT NOT NULL,           -- The rule/convention/pattern
  rationale TEXT,                   -- Why this matters

  -- Source tracking
  source_type TEXT NOT NULL DEFAULT 'observation',
    -- pr_review, code_review, debugging, convention, architecture_decision, observation
  source_ref TEXT,                  -- PR URL, issue link, commit hash

  -- Scoping
  project TEXT NOT NULL DEFAULT 'global',  -- Which project, or "global"
  codebase_areas TEXT[] DEFAULT '{}',      -- e.g., repository, transformer, API, service, hook
  tags TEXT[] DEFAULT '{}',                -- Flexible categorization

  -- Examples
  examples JSONB DEFAULT '{}',     -- { "good": "...", "bad": "...", "context": "..." }

  -- Lifecycle
  confidence INT NOT NULL DEFAULT 1,  -- Starts at 1, bumps when reinforced
  active BOOLEAN NOT NULL DEFAULT true,
  deprecated_reason TEXT,

  -- Vector search
  embedding VECTOR(1536),

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_learnings_embedding ON learnings
  USING hnsw (embedding vector_cosine_ops) WITH (m = 16, ef_construction = 64);
CREATE INDEX idx_learnings_project ON learnings (project);
CREATE INDEX idx_learnings_areas ON learnings USING gin (codebase_areas);
CREATE INDEX idx_learnings_tags ON learnings USING gin (tags);
CREATE INDEX idx_learnings_active ON learnings (active);
CREATE INDEX idx_learnings_confidence ON learnings (confidence DESC);
CREATE INDEX idx_learnings_source_type ON learnings (source_type);

-- Auto-update timestamp trigger
CREATE OR REPLACE FUNCTION update_learnings_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER learnings_updated_at
  BEFORE UPDATE ON learnings
  FOR EACH ROW EXECUTE FUNCTION update_learnings_updated_at();
```

### `learning_links` table (connects learnings to each other)

```sql
CREATE TABLE learning_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id UUID NOT NULL REFERENCES learnings(id) ON DELETE CASCADE,
  target_id UUID NOT NULL REFERENCES learnings(id) ON DELETE CASCADE,
  relationship TEXT NOT NULL DEFAULT 'relates_to',
    -- relates_to, supersedes, contradicts, reinforces, specializes
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(source_id, target_id, relationship)
);
```

## MCP Tools

### Write Tools

| Tool | Description |
|------|-------------|
| `capture_learning` | Capture a new learning with source context. Auto-extracts codebase areas and tags. |
| `reinforce_learning` | Bump confidence on a learning that proved useful. Optionally add notes. |
| `deprecate_learning` | Mark a learning as inactive with a reason (pattern changed, was wrong, etc.) |
| `update_learning` | Modify an existing learning's content, examples, or metadata. |

### Read Tools

| Tool | Description |
|------|-------------|
| `query_learnings` | Semantic search across learnings. "What do I know about transformer patterns?" |
| `filter_learnings` | Structured browse by project, codebase area, tags, source type, confidence, and date range. |
| `get_learning` | Retrieve a single learning by ID with full detail. |
| `review_learnings` | Stats: total, by project, by area, by confidence level, recent additions. |

### Management Tools

| Tool | Description |
|------|-------------|
| `link_learnings` | Create typed relationships between learnings. |
| `reactivate_learning` | Un-deprecate a learning. |

## Beads Integration

This is where it gets interesting. Beads tracks tasks; Agent Cortex tracks knowledge.
They complement each other at specific workflow touchpoints:

### 1. Pre-Work Recall (when starting a bead)

When an agent picks up a bead (`bd update <id> --status=in_progress`), the natural
next step is to check learnings relevant to the work ahead. This can be:

- **Manual**: User says "check your learnings for anything related to this work"
- **Skill-driven**: A `/recall` skill that takes the bead's title/description,
  extracts the codebase area, and queries Agent Cortex automatically
- **Hook-driven**: A PostToolUse hook on `bd update` that auto-suggests relevant
  learnings when status changes to in_progress

### 2. Post-Work Capture (when closing a bead)

When closing a bead, prompt for learnings:
- **Manual**: User says "capture this in your learnings"
- **Skill-driven**: A `/learn` skill that guides structured capture
- **Hook-driven**: A Stop hook or post-close prompt that asks "any learnings from
  this work worth capturing?"

### 3. PR Review Integration

The richest source of learnings. Workflow:
1. PR is reviewed, comments are left
2. User pulls comments: `gh api repos/org/repo/pulls/123/comments`
3. Together, iterate through comments
4. For each actionable comment: "capture this as a learning"
5. Learning is stored with `source_type: 'pr_review'`, `source_ref: 'PR #123 URL'`

A `/learn-from-pr` skill could automate steps 2-5.

### 4. Cross-Session Context Recovery

After compaction or new session:
- `bd ready` shows what to work on (task context)
- `query_learnings` for the relevant area gives you institutional knowledge
- Together they reconstruct full working context

### 5. Bead-Learning References

Learnings can reference bead IDs in their `source_ref` field:
- `source_type: 'task_completion'`, `source_ref: 'beads-abc'`
- When reviewing a bead's history, you can find associated learnings

## Skills Integration

### `/learn` Skill

Triggered by: "capture this learning", "remember this pattern", "save this to learnings"

Workflow:
1. Takes the current conversation context
2. Checks whether the knowledge already exists as a durable file; if yes, captures a pointer learning instead of duplicating the file
3. Asks clarifying questions if needed (what area? which project?)
4. Calls `capture_learning` with structured input
5. Confirms what was captured

### `/recall` Skill

Triggered by: "check your learnings", "what do you know about", "any learnings for"

Workflow:
1. Takes the current work context (bead description, file being edited, area)
2. Calls `query_learnings` with semantic search
3. Calls `filter_learnings` for structured project/area/date/tag filtering when useful
4. Presents relevant learnings in a concise format, preferring canonical file paths when a pointer learning is returned
5. Asks "should I apply any of these?"

### `/learn-from-pr` Skill

Triggered by: "learn from PR", "review PR learnings", "extract learnings from PR"

Workflow:
1. Fetches PR comments via `gh api`
2. Groups by theme/file
3. For each actionable comment, proposes a learning
4. User approves/edits each
5. Batch captures to Agent Cortex

### `/learnings-report` Skill

Triggered by: "show my learnings", "learnings report", "what has the agent learned"

Workflow:
1. Calls `review_learnings` for stats
2. Shows recent learnings, top areas, confidence distribution
3. Optionally filters by project or time range

## Metadata Extraction

Similar to Open Brain's extraction service, but with a different prompt tuned for
extracting codebase areas and tags from learning text:

```
Analyze the following learning/pattern and extract structured metadata. Return ONLY valid JSON.

{
  "codebase_areas": ["2-4 areas of code this applies to"],
  "tags": ["2-5 categorization tags"],
  "source_type": "one of: pr_review, code_review, debugging, convention, architecture_decision, observation"
}

Rules:
- codebase_areas: architectural layers or domains (e.g., repository, transformer, API,
  service, middleware, hook, migration, testing, configuration, deployment)
- tags: descriptive categorization (e.g., error-handling, naming-convention,
  performance, security, testing-pattern, type-safety)
- source_type: best fit for where this knowledge came from
```

## Project Structure

```
agent_cortex/
  src/
    index.ts              -- MCP server setup + tool registration
    types/
      index.ts            -- TypeScript types
    db/
      client.ts           -- Postgres connection
      queries.ts          -- All SQL queries
    services/
      embeddings.ts       -- OpenAI embedding generation
      extraction.ts       -- Bedrock metadata extraction
    tools/
      capture.ts          -- capture_learning
      query.ts            -- query_learnings (semantic search)
      filter.ts           -- filter_learnings
      get.ts              -- get_learning
      reinforce.ts        -- reinforce_learning
      deprecate.ts        -- deprecate_learning
      update.ts           -- update_learning
      review.ts           -- review_learnings (stats)
      link.ts             -- link_learnings
      reactivate.ts       -- reactivate_learning
  scripts/
    setup-db.ts           -- Database migration
  package.json
  tsconfig.json
  .env.example
```

## Implementation Phases

### Phase 1: Project Scaffolding
- package.json, tsconfig.json, .env.example
- DB client, connection setup
- Types definition

### Phase 2: Database Schema + Migration
- setup-db.ts script
- learnings table + learning_links table
- All indexes and triggers

### Phase 3: Core Services
- Embeddings service (shared pattern with Open Brain)
- Extraction service (learning-specific prompt)

### Phase 4: Write Tools
- capture_learning (with parallel embedding + extraction)
- update_learning
- reinforce_learning
- deprecate_learning, reactivate_learning

### Phase 5: Read Tools
- query_learnings (semantic search)
- filter_learnings
- get_learning
- review_learnings (stats)

### Phase 6: Link Tools
- link_learnings

### Phase 7: Skills
- /learn skill
- /recall skill
- /learn-from-pr skill

### Phase 8: Integration + Polish
- MCP registration docs
- Beads workflow documentation
- README
