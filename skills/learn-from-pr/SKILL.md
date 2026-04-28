---
name: learn-from-pr
description: |
  Extract learnings from pull request review comments. Fetches PR comments,
  identifies actionable patterns and conventions, and batch-captures them
  into Agent Cortex.
  Use when asked to: "learn from PR", "extract learnings from PR", "review PR feedback",
  "capture PR review learnings", "what can we learn from this PR".

  Triggers: "learn from PR", "PR learnings", "extract from PR review",
  "capture PR feedback", "learn from review", "/learn-from-pr"
---

# Learn From PR Skill

Extract and capture learnings from pull request review comments.

## Workflow

1. **Get the PR reference** from the user. This can be:
   - A PR number: `#342`
   - A full URL: `https://github.com/org/repo/pull/342`
   - Just a number if the repo is obvious from context

2. **Fetch PR comments** using the GitHub CLI:
   ```bash
   gh api repos/{owner}/{repo}/pulls/{number}/comments
   ```
   Also fetch review comments (different endpoint):
   ```bash
   gh api repos/{owner}/{repo}/pulls/{number}/reviews
   ```

3. **Analyze each comment** and categorize:
   - **Actionable pattern**: A comment that identifies a pattern violation, convention, or best practice → capture as a learning
   - **Nitpick/style**: Minor formatting or style preference → skip unless recurring
   - **Question/discussion**: Not a pattern → skip
   - **Bug/fix**: An actual bug found → capture as a debugging learning

4. **For each actionable comment, propose a learning:**
   - pattern: The rule or convention being enforced
   - rationale: Why the reviewer flagged it (from the comment context)
   - source_ref: The PR URL
   - source_type: "pr_review"
   - project: Derived from the repo name
   - codebase_areas: Derived from the file path(s) in the review
   - examples: { bad: "the code that was flagged", good: "the suggested fix" } when available

5. **Present each proposed learning to the user** for approval/editing before capture.

6. **Batch capture** approved learnings using `capture_learning`.

7. **Summary**: Show how many learnings were captured, from which areas.

## Example Interaction

User: "Learn from PR #342 in craft-ai-agents"

Response:
1. Fetch comments: `gh api repos/org/craft-ai-agents/pulls/342/comments`
2. Analyze: Found 8 comments, 3 are actionable patterns
3. Present each:
   - "Repository layer: must use transaction manager, not raw queries" — Capture? [y/n]
   - "Transformer tests: mock external API client, don't call directly" — Capture? [y/n]
   - "Config templates: use YAML anchors to avoid duplication" — Capture? [y/n]
4. Capture approved learnings
5. Summary: "3 learnings captured from PR #342 (areas: repository, testing, configuration)"

## Tips

- Focus on patterns that would apply to future PRs, not one-off fixes
- Group related comments into a single learning when they address the same pattern
- Include the file path context in the codebase_areas extraction
- If the same pattern was flagged multiple times across different PRs, reinforce the existing learning instead of creating a duplicate
