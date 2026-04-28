# Recall.it Research & Feature Recommendations for Agent Cortex

**Date:** 2026-04-22
**Context:** Research into Recall.it (v2.0) and AI knowledge management patterns. Goal: identify applicable concepts for Agent Cortex's persistent agent learning system.

---

## Relevant Recall.it Patterns

Agent Cortex and Recall serve different purposes — Recall is a personal content KB, Cortex is a persistent learning layer for AI agents. But several architectural patterns transfer well.

### 1. MCP Tool Design

Recall's MCP server has a clean 4-tool surface:
- `search` — semantic + keyword
- `filter_by_metadata` — structured filtering without semantic search
- `get_document_content` — full content retrieval
- `explore_kb` — high-level stats and structure overview

**For Cortex:** This separation of concerns is worth adopting. Currently Agent Cortex exposes learnings through MCP, but the tool design could be tightened:

| Recall Tool | Cortex Equivalent | Notes |
|---|---|---|
| `search` | `search_learnings` | Already exists, good |
| `filter_by_metadata` | `filter_learnings` | **Add this.** Filter by project, error type, agent, date range without semantic overhead |
| `get_document_content` | `get_learning_detail` | Full learning with context, related learnings, usage history |
| `explore_kb` | `cortex_overview` | **Add this.** Stats: total learnings, by project, most-referenced, staleness metrics |

### 2. Auto-Tagging / Classification

Recall auto-generates tags and categories for every saved item using LLM analysis.

**For Cortex:** Agent learnings should be auto-classified on ingest:
- **Project** (auto-detected from file paths, repo context)
- **Domain** (frontend, backend, infra, testing, architecture, etc.)
- **Type** (error-pattern, best-practice, gotcha, tool-usage, performance, security)
- **Severity** (critical, important, nice-to-know)

Currently agents store learnings with minimal metadata. Richer classification enables scoped retrieval.

### 3. Auto-Connections Between Learnings

Recall connects related content automatically via embeddings.

**For Cortex:**
- On every new learning, find the 3 most similar existing learnings
- Store as connections with similarity scores
- Surface during retrieval: "This is related to learning X from project Y"
- Enables cross-project pattern detection: "You hit this same issue in 3 different projects"

**This is arguably more valuable for Cortex than for a personal KB.** Agents repeat mistakes across projects because learnings are siloed. Cross-project connections break the silos.

### 4. Scoped Retrieval

Recall uses `@folder` / `@tag` to scope chat context.

**For Cortex:** Agents should be able to scope retrieval:
- `@project:open-brain` — only learnings from this project
- `@type:error-pattern` — only error patterns
- `@domain:backend` — only backend learnings
- `@recent:7d` — only last 7 days

This prevents irrelevant learnings from polluting context when an agent is working on a specific task.

### 5. Pre-Task Briefing (Novel — Not in Recall)

Recall doesn't do this, but the concept of "resurfacing" translates to a powerful Cortex feature:

**Before an agent starts a task**, Cortex should:
1. Analyse the task description
2. Search for relevant learnings (semantic + project filter)
3. Inject a "briefing" of the top 3-5 relevant learnings into the agent's context
4. Include: what went wrong before, what worked, gotchas to watch for

This is the difference between an agent that repeats mistakes and one that learns from them.

**Implementation:** New MCP tool `get_briefing(task_description, project?)` that returns a structured briefing document.

---

## Recommended Features — Priority Order

### Priority 1: Scoped Retrieval (filter_learnings)

**What:** Add metadata-based filtering to the MCP interface.

**Why:** Agents working on a React frontend don't need Terraform learnings in their context. Scoping reduces noise and improves relevance.

**Effort:** Low. Add filter parameters to existing search, expose as new MCP tool.

### Priority 2: Auto-Classification on Ingest

**What:** When a learning is stored, auto-classify by project, domain, type, and severity using an LLM call.

**Why:** Rich metadata enables scoped retrieval (#1) and cross-project analysis. Without it, everything is a flat bag of text.

**Effort:** Low-medium. LLM call on ingest (similar to Open Brain's domain classification).

### Priority 3: Pre-Task Briefing

**What:** New `get_briefing` MCP tool. Input: task description + optional project. Output: structured summary of relevant past learnings.

**Why:** This is the killer feature that makes Cortex genuinely useful vs. just a passive store. Agents that brief themselves before tasks make fewer mistakes.

**Effort:** Medium. Semantic search + LLM synthesis of top-N results into a briefing format.

### Priority 4: Cross-Learning Connections

**What:** Auto-link related learnings on ingest. Surface connections during retrieval.

**Why:** "You've seen this pattern before in 3 other projects" is incredibly valuable for agents. Breaks the project-silo problem.

**Effort:** Medium. Embedding similarity on ingest + connections table + enriched retrieval response.

### Priority 5: Cortex Overview / Stats

**What:** `cortex_overview` MCP tool returning KB stats, top projects, most-referenced learnings, staleness metrics.

**Why:** Useful for monitoring and understanding what Cortex has learned. Also good for debugging and auditing.

**Effort:** Low. Aggregate queries on existing data.

---

## What NOT to Adopt from Recall

- **Spaced repetition** — agents don't need quizzes. Pre-task briefing is the agent equivalent.
- **Knowledge graph visualisation** — nice for humans, low value for agents. Maybe later as a dashboard feature.
- **Multi-model selection** — agents use whatever model they're configured with. No need for model switching.
- **Browser extension / capture UX** — agents capture learnings programmatically, no UX needed.

---

## Architecture Notes

### Current Agent Cortex Stack
- TypeScript, Supabase (PostgreSQL), embeddings for semantic search
- MCP server for agent access
- Launchd service (`com.vibes.agent-cortex`)

### Suggested Schema Additions

```sql
-- Auto-classification metadata
ALTER TABLE learnings ADD COLUMN IF NOT EXISTS domain TEXT;
ALTER TABLE learnings ADD COLUMN IF NOT EXISTS learning_type TEXT;
ALTER TABLE learnings ADD COLUMN IF NOT EXISTS severity TEXT DEFAULT 'important';
ALTER TABLE learnings ADD COLUMN IF NOT EXISTS tags TEXT[];

-- Cross-learning connections
CREATE TABLE IF NOT EXISTS learning_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  learning_id UUID REFERENCES learnings(id),
  connected_learning_id UUID REFERENCES learnings(id),
  similarity_score FLOAT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(learning_id, connected_learning_id)
);

-- Usage tracking (for briefings)
CREATE TABLE IF NOT EXISTS learning_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  learning_id UUID REFERENCES learnings(id),
  used_in_task TEXT,
  used_by_agent TEXT,
  used_at TIMESTAMPTZ DEFAULT NOW()
);
```

### New MCP Tools

```typescript
// Scoped filtering
filter_learnings(filters: {
  project?: string;
  domain?: string;
  type?: string;
  severity?: string;
  since?: string; // ISO date
  tags?: string[];
}): Learning[]

// Pre-task briefing
get_briefing(params: {
  task: string;
  project?: string;
  maxLearnings?: number; // default 5
}): Briefing

// KB overview
cortex_overview(): {
  totalLearnings: number;
  byProject: Record<string, number>;
  byDomain: Record<string, number>;
  mostReferenced: Learning[];
  recentlyAdded: Learning[];
  staleCount: number; // learnings > 30 days old, never referenced
}
```

---

## Implementation Roadmap

| Phase | Features | Effort | Impact |
|---|---|---|---|
| **Phase 1** | Scoped retrieval + auto-classification | 1 day | High — immediate agent UX improvement |
| **Phase 2** | Pre-task briefing tool | 1 day | Transformative — agents learn from history |
| **Phase 3** | Cross-learning connections | 1 day | High — breaks project silos |
| **Phase 4** | Cortex overview + usage tracking | Half day | Monitoring + audit |

---

## References

- Recall.it docs: https://docs.recall.it/
- Recall MCP design: https://docs.recall.it/public-api (redirects to /developer/mcp)
- ML Mastery — AI Agent Memory Frameworks 2026: https://machinelearningmastery.com/the-6-best-ai-agent-memory-frameworks-you-should-try-in-2026/
- Recall v2 press release: https://www.businesswire.com/news/home/20260414036848/
