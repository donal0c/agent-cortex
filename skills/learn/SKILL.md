---
name: learn
description: |
  Capture a learning, pattern, or convention into Agent Cortex (persistent AI agent memory).
  Use when asked to: "remember this", "capture this learning", "save this pattern",
  "add this to your learnings", "don't forget this", "learn from this".

  Guides structured capture of learnings from the current conversation context,
  including pattern, rationale, source reference, codebase area, and examples.

  Triggers: "learn this", "remember this pattern", "capture this learning",
  "save to learnings", "add to cortex", "don't forget", "/learn"
---

# Learn Skill

Capture a learning into Agent Cortex for future recall.

## Workflow

1. **Identify the learning** from the current conversation context. Ask the user to clarify if the pattern isn't obvious.

2. **Check for durable-file ownership.** If the knowledge already lives in a durable file (wiki page, decision, runbook, source note, project doc), capture a pointer learning instead of duplicating the file's content:
   - **pattern**: "For <topic>, read <file path> before answering or acting."
   - **rationale**: Why that file is canonical.
   - **source_ref**: The file path.
   - **examples.context**: When to use the pointer.

3. **Determine the key fields:**
   - **pattern**: The rule, convention, or insight (clear, actionable statement)
   - **rationale**: Why this matters (optional but valuable)
   - **source_ref**: Where it came from — PR URL, file path, bead ID, or conversation context
   - **project**: Which project this applies to, or "global" if universal
   - **codebase_areas**: Which architectural layers/domains (auto-extracted if omitted)
   - **examples**: Good/bad code snippets if applicable

4. **Call `capture_learning`** with the structured input. Let the auto-extraction handle `codebase_areas` and `tags` unless the user specified them explicitly.

5. **Confirm** what was captured. Show the learning ID, pattern, and extracted metadata.

## Example Interaction

User: "Remember that in craft-ai-agents, repository classes must use the transaction manager pattern, not raw SQL queries"

Response: Call `capture_learning` with:
- pattern: "Repository classes in craft-ai-agents must use the transaction manager pattern, not raw SQL queries"
- project: "craft-ai-agents"
- codebase_areas: ["repository", "database"]
- source_type: "convention"

## Tips

- Keep patterns concise and actionable — they should read like a rule, not a story
- Always try to capture the rationale (the "why") alongside the pattern (the "what")
- If the learning came from a PR review, include the PR URL as source_ref
- If capturing from a debugging session, include relevant file paths
- If a durable file is canonical, make Cortex point to it; do not store a long duplicate summary
- For code style conventions, include good/bad examples when possible
