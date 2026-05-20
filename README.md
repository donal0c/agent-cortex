# Agent Cortex

An MCP server for persistent AI agent learnings. Captures patterns, conventions, and mistakes discovered during development work — PR reviews, debugging sessions, architectural decisions — and makes them retrievable by semantic search or codebase area.

Unlike Open Brain (which captures human thoughts), Agent Cortex is the agent's institutional knowledge that survives context switches, session boundaries, and compaction cycles.

## Relationship to File-Backed Memory

Agent Cortex can work alongside a Git-backed memory vault such as `work-agent-memory`. In that setup, files remain canonical and Cortex is the retrieval/briefing layer.

When a durable wiki page, decision, runbook, or source note already exists on disk, capture a **pointer learning** rather than duplicating the full content. The learning should say what to read and when to read it, with `source_ref` set to the file path.

Use full Cortex-native learnings for concise rules, gotchas, conventions, and mistakes that do not yet warrant a durable file. If a learning grows into a process or synthesis, promote it to files and update Cortex to point at the file.

## Architecture

- **MCP SDK** (`@modelcontextprotocol/sdk`) with stdio transport
- **Supabase PostgreSQL** + pgvector for storage and vector similarity search
- **OpenAI** `text-embedding-3-small` for 1536-dim embeddings
- **Claude Sonnet** via AWS Bedrock for metadata extraction (codebase areas, tags, source type)

## Tools

### Write Tools

| Tool | Description |
|------|-------------|
| `capture_learning` | Capture a pattern/convention with auto-extracted metadata. |
| `update_learning` | Modify an existing learning. Re-generates embedding if pattern changes. |
| `reinforce_learning` | Bump confidence when a learning proves useful again. |
| `deprecate_learning` | Mark a learning inactive with a reason. |
| `reactivate_learning` | Un-deprecate a learning. |

### Read Tools

| Tool | Description |
|------|-------------|
| `query_learnings` | Semantic search by meaning. "transformer error handling patterns" |
| `filter_learnings` | Browse learnings by tags, source type, project, areas, date range, confidence. |
| `get_learning` | Retrieve a single learning by ID. |
| `review_learnings` | Aggregate stats: totals, by project, by area, confidence distribution. |

### Link Tools

| Tool | Description |
|------|-------------|
| `link_learnings` | Create typed relationships: relates_to, supersedes, contradicts, reinforces, specializes. |
| `get_linked` | Get all learnings linked to a given learning. |

### Todo Tools

| Tool | Description |
|------|-------------|
| `capture_todo` | Quickly capture a to-do item. Only `text` is required. |
| `list_todos` | List todos with filters: status, project, priority, date range. Defaults to open. |
| `update_todo` | Edit a todo, mark it done/cancelled, or reopen it. |
| `delete_todo` | Permanently delete a to-do item. |

## Skills

| Skill | Trigger | Description |
|-------|---------|-------------|
| `/learn` | "remember this", "capture this learning" | Guided capture of a learning from current context |
| `/recall` | "check your learnings", "any patterns for" | Query learnings relevant to current work |
| `/learn-from-pr` | "learn from PR", "extract PR learnings" | Pull PR comments and batch-capture actionable patterns |

## Confidence System

Learnings start at confidence 1. Each time a learning is validated (via `reinforce_learning`), confidence increases. Higher confidence learnings are prioritized in area-based lookups. Learnings that prove wrong can be deprecated without deletion, preserving history.

## Todos

Lightweight to-do items for quick action capture. Unlike learnings (institutional knowledge) or beads (structured project work), todos are ephemeral sticky notes — capture fast, check the list, cross off, throw away.

- **Priority**: 1 (high), 2 (medium, default), 3 (low)
- **Status lifecycle**: open → done / cancelled (or delete entirely)
- **Date filtering**: Primary retrieval pattern — e.g., "show me last week's todos"
- **Learning links**: Optionally link a todo to a related learning via `related_learning_id`

## Setup

### Prerequisites

- Node.js >= 20
- A Supabase project with pgvector enabled (can share with Open Brain)
- OpenAI API key
- AWS credentials with Bedrock access

### Install

```bash
pnpm install
pnpm build
```

### Environment Variables

Copy `.env.example` to `.env` and fill in your credentials:

```
SUPABASE_DB_URL    # PostgreSQL connection string (transaction pooler, port 6543)
OPENAI_API_KEY     # For text-embedding-3-small
AWS_REGION         # For Bedrock (e.g., us-east-1)
AWS_ACCESS_KEY_ID
AWS_SECRET_ACCESS_KEY
BEDROCK_MODEL_ID   # Optional (default: us.anthropic.claude-sonnet-4-6)
```

### Database Migration

Run once to create the `learnings` and `learning_links` tables:

```bash
pnpm setup-db
```

### Register with Claude Code

```bash
claude mcp add -s user \
  -e SUPABASE_DB_URL=your-connection-string \
  -e OPENAI_API_KEY=your-key \
  -e AWS_REGION=us-east-1 \
  -e AWS_ACCESS_KEY_ID=your-key-id \
  -e AWS_SECRET_ACCESS_KEY=your-secret \
  agent-cortex -- node /path/to/agent_cortex/dist/index.js
```

## Workflow with Beads

Agent Cortex complements beads (task tracking):

1. **Starting a task**: `bd show <id>` then `/recall` for relevant learnings
2. **During work**: Agent applies known patterns from cortex; capture quick action items with `capture_todo`
3. **After PR review**: `/learn-from-pr` to capture reviewer feedback
4. **Closing a task**: `/learn` to capture any new patterns discovered; check `list_todos` for loose ends

## Database Schema

### `learnings` table

- `pattern` — the rule/convention/pattern
- `rationale` — why it matters
- `source_type` — pr_review, code_review, debugging, convention, architecture_decision, observation
- `source_ref` — PR URL, issue link, file path
- `project` — which project (or "global")
- `codebase_areas` — text array (GIN indexed): repository, transformer, API, etc.
- `tags` — text array (GIN indexed)
- `examples` — JSONB: { good, bad, context }
- `confidence` — integer, starts at 1, increases with reinforcement
- `active` — boolean, false when deprecated
- `embedding` — 1536-dim vector (HNSW indexed)

### Pointer learning convention

For file-backed memory, prefer this shape:

- `pattern`: "For <topic>, read <file path> before answering or acting."
- `rationale`: why that file is canonical for the topic.
- `source_ref`: relative or absolute file path.
- `project`: the memory repo or downstream project name.
- `examples.context`: when the pointer should be used.

Pointer learnings are intentionally short. The file holds the detail; Cortex helps agents find it.

### `todos` table

- `text` — the to-do item
- `project` — which project (default: "global")
- `priority` — 1 (high), 2 (medium), 3 (low)
- `status` — open, done, or cancelled
- `related_learning_id` — optional FK to a learning
- `tags` — text array (GIN indexed)
- `completed_at` — set automatically when status changes to done/cancelled
