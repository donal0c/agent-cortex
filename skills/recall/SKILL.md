---
name: recall
description: |
  Query Agent Cortex for relevant learnings before or during work. Retrieves patterns,
  conventions, and past mistakes relevant to the current task or codebase area.
  Use when asked to: "check your learnings", "what do you know about", "any patterns for",
  "recall learnings", "review what you've learned", "read your learnings".

  Combines semantic search with area-based filtering to find the most relevant learnings.

  Triggers: "check learnings", "recall", "what do you know about", "any learnings for",
  "patterns for this area", "read your learnings", "check cortex", "/recall"
---

# Recall Skill

Query Agent Cortex for learnings relevant to the current work.

## Workflow

1. **Determine the search context** from the user's request or current work:
   - What area of code are we working in? (e.g., repository, transformer, API)
   - What project? (specific project name or global)
   - Any specific concern? (e.g., error handling, testing patterns)

2. **Start with `get_briefing`:**
   - Use the task description as the query.
   - Pass a project filter when it is obvious.
   - Treat returned file paths as pointers, not as permission to deep-read everything.

3. **Only deepen when needed:**
   - `query_learnings` — semantic search with a natural language query derived from the context
   - `filter_learnings` — structured lookup by project, area, tag, source type, or date when those filters are identifiable

4. **Deduplicate and rank** the combined results by relevance and confidence.

5. **Present findings concisely:**
   - List each relevant learning with its pattern, confidence level, and source
   - If a learning points to a canonical file, surface the file path prominently and prefer reading that file over expanding the learning into a long answer
   - Highlight high-confidence learnings (confidence >= 3)
   - Note any examples (good/bad code) that are directly applicable
   - If no learnings found, say so clearly

6. **Ask** if any learnings should be applied to the current work, or if the user wants to reinforce/update any.

## Example Interaction

User: "Check your learnings for anything about the transformer layer"

Response:
1. Call `get_briefing` with task: "transformer layer patterns and conventions"
2. If the briefing is thin, call `query_learnings` or `filter_learnings`
3. Present concise results

## Integration with Task Context

When starting work, the natural flow is:
1. Read the current task source (pinned thread, issue, PR, spec, or planning note)
2. `/recall` with the task's domain/area to load relevant learnings
3. Apply learnings during implementation
4. `/learn` to capture any new patterns discovered

## Tips

- Cast a wide net: search both by semantic meaning and by area
- Pay attention to confidence scores — high-confidence learnings have been validated multiple times
- Treat file-backed memory as canonical when a learning's `source_ref` is a durable file path
- If a learning helped you, reinforce it with `reinforce_learning`
- If a learning is wrong or outdated, flag it for deprecation
