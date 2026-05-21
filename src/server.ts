import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import { captureLearning } from './tools/capture.js';
import { queryLearnings } from './tools/query.js';
import { getLearning } from './tools/get.js';
import { updateLearningTool } from './tools/update.js';
import { reviewLearnings } from './tools/review.js';
import { filterLearningsTool } from './tools/filter.js';
import { linkLearnings, getLinked } from './tools/link.js';
import { captureTodo, listTodosTool, updateTodoTool, deleteTodoTool } from './tools/todo.js';
import { getBriefing } from './tools/briefing.js';

const sourceTypeEnum = z.enum([
  'pr_review', 'code_review', 'debugging',
  'convention', 'architecture_decision', 'observation',
  'idea', 'note', 'preference', 'reference', 'troubleshooting',
]);

const linkRelationshipEnum = z.enum([
  'relates_to', 'supersedes', 'contradicts', 'reinforces', 'specializes',
]);

const todoStatusEnum = z.enum(['open', 'done', 'cancelled']);

// Accepts either string[] or a comma-separated string like "auth,api"
const coercedStringArray = z.union([
  z.array(z.string()),
  z.string().transform(s => s.split(',').map(t => t.trim()).filter(Boolean)),
]);

const learningExamplesSchema = z.object({
  good: z.string().optional(),
  bad: z.string().optional(),
  context: z.string().optional(),
}).optional();

export function createServer(): McpServer {
  const server = new McpServer({
    name: 'agent-cortex',
    version: '0.2.0',
  });

  // --- Write Tools ---

  server.registerTool('capture_learning', {
    title: 'Capture Learning',
    description:
      'Capture a new learning, pattern, or convention. Auto-extracts codebase areas and tags. ' +
      'Use this when you discover a pattern, convention, or mistake worth remembering.',
    inputSchema: {
      pattern: z.string().min(1).max(10000).describe(
        'The rule, pattern, or convention to remember'
      ),
      rationale: z.string().max(5000).optional().describe(
        'Why this matters — the reasoning behind the pattern'
      ),
      source_type: sourceTypeEnum.optional().describe(
        'Where this learning came from. Auto-detected if omitted.'
      ),
      source_ref: z.string().max(1000).optional().describe(
        'Reference to source: PR URL, issue link, commit hash, file path'
      ),
      project: z.string().max(200).optional().describe(
        'Which project this applies to. Default: "global" (applies everywhere)'
      ),
      codebase_areas: coercedStringArray.optional().describe(
        'Areas of code this applies to (e.g., repository, transformer, API). Auto-extracted if omitted.'
      ),
      tags: coercedStringArray.optional().describe(
        'Categorization tags. Auto-extracted if omitted.'
      ),
      examples: learningExamplesSchema.describe(
        'Optional code examples: { good: "correct way", bad: "wrong way", context: "when this applies" }'
      ),
      force: z.boolean().optional().describe(
        'Skip duplicate detection and capture even if a similar learning exists. Default: false.'
      ),
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
  }, async (args) => {
    return captureLearning(args);
  });

  server.registerTool('update_learning', {
    title: 'Update Learning',
    description:
      'Update an existing learning. Supports editing fields, reinforcing (boost confidence), ' +
      'deprecating (mark inactive), and reactivating. Provide only the fields you want to change. ' +
      'Set reinforce=true to boost confidence. Set active=false with deprecated_reason to deprecate. ' +
      'Set active=true to reactivate a deprecated learning.',
    inputSchema: {
      id: z.string().uuid().describe('The UUID of the learning to update'),
      pattern: z.string().min(1).max(10000).optional().describe(
        'New pattern text. If changed, embedding and metadata are re-generated.'
      ),
      rationale: z.string().max(5000).optional().describe('Updated rationale'),
      source_type: sourceTypeEnum.optional().describe('Override source type'),
      source_ref: z.string().max(1000).optional().describe('Override source reference'),
      project: z.string().max(200).optional().describe('Override project'),
      codebase_areas: coercedStringArray.optional().describe(
        'Updated codebase areas (e.g., ["api", "auth"]). Accepts array or comma-separated string.'
      ),
      tags: coercedStringArray.optional().describe(
        'Updated tags (e.g., ["error-handling", "type-safety"]). Accepts array or comma-separated string.'
      ),
      examples: learningExamplesSchema.describe('Override examples'),
      reinforce: z.boolean().optional().describe(
        'Set true to increase confidence by 1. Use when a learning proved useful again.'
      ),
      reinforce_note: z.string().max(500).optional().describe(
        'Optional note about how/why this learning was useful (only used with reinforce=true)'
      ),
      active: z.boolean().optional().describe(
        'Set false to deprecate (requires deprecated_reason). Set true to reactivate.'
      ),
      deprecated_reason: z.string().max(1000).optional().describe(
        'Why this learning is being deprecated (required when active=false)'
      ),
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
  }, async (args) => {
    return updateLearningTool(args);
  });

  // --- Read Tools ---

  server.registerTool('query_learnings', {
    title: 'Query Learnings',
    description:
      'Search learnings by meaning using vector similarity. Use this to find relevant patterns ' +
      'before starting work on a task. Example: "transformer layer error handling patterns"',
    inputSchema: {
      query: z.string().min(1).max(2000).describe('Natural language search query'),
      project: z.string().optional().describe(
        'Filter to a specific project (also includes global learnings)'
      ),
      include_deprecated: z.boolean().optional().describe(
        'Include deprecated learnings in results. Default: false.'
      ),
      limit: z.number().int().min(1).max(50).default(10).describe(
        'Max results to return (default 10)'
      ),
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  }, async (args) => {
    return queryLearnings(args);
  });

  server.registerTool('get_briefing', {
    title: 'Get Briefing',
    description:
      'Return a short read-only pre-task briefing from Agent Cortex. Use this at task start ' +
      'when you need a small set of relevant pointer learnings without loading broad wiki content.',
    inputSchema: {
      task: z.string().min(1).max(2000).describe(
        'The current task, question, or work description to brief against'
      ),
      project: z.string().optional().describe(
        'Optional project filter. Global learnings are included automatically.'
      ),
      limit: z.number().int().min(1).max(5).default(5).describe(
        'Maximum briefing items to return. Capped at 5 to avoid context bloat.'
      ),
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  }, async (args) => {
    return getBriefing(args);
  });

  server.registerTool('filter_learnings', {
    title: 'Filter Learnings',
    description:
      'Browse and filter learnings by structured criteria: tags, source type, project, codebase areas, ' +
      'date range, and minimum confidence. Use this to list learnings without a search query, ' +
      'e.g. "show all ideas from this week" or "all debugging learnings tagged authentication".',
    inputSchema: {
      tags: z.array(z.string()).optional().describe(
        'Filter by tags (any match). Example: ["error-handling", "type-safety"]'
      ),
      source_type: sourceTypeEnum.optional().describe(
        'Filter by source type'
      ),
      project: z.string().optional().describe(
        'Filter to a specific project (also includes global learnings)'
      ),
      codebase_areas: z.array(z.string()).optional().describe(
        'Filter by codebase areas (any match). Example: ["database", "API"]'
      ),
      from_date: z.string().optional().describe(
        'Only learnings created on or after this date (ISO 8601). Example: "2026-03-01"'
      ),
      to_date: z.string().optional().describe(
        'Only learnings created on or before this date (ISO 8601). Example: "2026-03-12"'
      ),
      min_confidence: z.number().int().min(1).optional().describe(
        'Only learnings with confidence >= this value'
      ),
      include_deprecated: z.boolean().optional().describe(
        'Include deprecated learnings. Default: false.'
      ),
      limit: z.number().int().min(1).max(100).default(20).describe(
        'Max results to return (default 20)'
      ),
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  }, async (args) => {
    return filterLearningsTool(args);
  });

  server.registerTool('get_learning', {
    title: 'Get Learning',
    description: 'Retrieve a single learning by ID with full detail.',
    inputSchema: {
      id: z.string().uuid().describe('The UUID of the learning to retrieve'),
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  }, async (args) => {
    return getLearning(args);
  });

  server.registerTool('review_learnings', {
    title: 'Review Learnings',
    description:
      'Get aggregate statistics: totals, by project, by source type, top areas, top tags, ' +
      'average confidence, recent activity.',
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  }, async () => {
    return reviewLearnings();
  });

  // --- Link Tools ---

  server.registerTool('link_learnings', {
    title: 'Link Learnings',
    description:
      'Create a typed relationship between two learnings. Relationships: relates_to, ' +
      'supersedes (replaces), contradicts, reinforces (supports), specializes (narrows scope).',
    inputSchema: {
      source_id: z.string().uuid().describe('The UUID of the source learning'),
      target_id: z.string().uuid().describe('The UUID of the target learning'),
      relationship: linkRelationshipEnum.describe(
        'Type of relationship between the learnings'
      ),
      note: z.string().max(500).optional().describe(
        'Optional note explaining the relationship'
      ),
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false,
    },
  }, async (args) => {
    return linkLearnings(args);
  });

  server.registerTool('get_linked', {
    title: 'Get Linked Learnings',
    description: 'Retrieve all learnings linked to a given learning.',
    inputSchema: {
      id: z.string().uuid().describe('The UUID of the learning to get links for'),
      relationship: linkRelationshipEnum.optional().describe(
        'Optional: filter by relationship type'
      ),
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  }, async (args) => {
    return getLinked(args);
  });

  // --- Todo Tools ---

  server.registerTool('capture_todo', {
    title: 'Capture Todo',
    description:
      'Quickly capture a to-do item. Only the text is required — everything else is optional. ' +
      'Use this for fast action-item capture that survives session boundaries.',
    inputSchema: {
      text: z.string().min(1).max(5000).describe(
        'The to-do item text'
      ),
      project: z.string().max(200).optional().describe(
        'Which project this applies to. Default: "global"'
      ),
      priority: z.number().int().min(1).max(3).default(2).describe(
        'Priority: 1 = high, 2 = medium (default), 3 = low'
      ),
      tags: coercedStringArray.optional().describe(
        'Optional tags for categorization. Accepts array or comma-separated string.'
      ),
      related_learning_id: z.string().uuid().optional().describe(
        'Optional: link this todo to an existing learning by ID'
      ),
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false,
    },
  }, async (args) => {
    return captureTodo(args);
  });

  server.registerTool('list_todos', {
    title: 'List Todos',
    description:
      'List to-do items with optional filters. Defaults to showing open todos, most recent first. ' +
      'Use from_date/to_date to filter by creation date (e.g., "last week\'s todos").',
    inputSchema: {
      status: todoStatusEnum.optional().describe(
        'Filter by status. Default: "open". Use "done" or "cancelled" to see completed items.'
      ),
      project: z.string().optional().describe(
        'Filter to a specific project (also includes global todos)'
      ),
      priority: z.number().int().min(1).max(3).optional().describe(
        'Filter by priority: 1 = high, 2 = medium, 3 = low'
      ),
      from_date: z.string().optional().describe(
        'Only todos created on or after this date (ISO 8601). Example: "2026-04-07"'
      ),
      to_date: z.string().optional().describe(
        'Only todos created on or before this date (ISO 8601). Example: "2026-04-13"'
      ),
      limit: z.number().int().min(1).max(100).default(20).describe(
        'Max results to return (default 20)'
      ),
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  }, async (args) => {
    return listTodosTool(args);
  });

  server.registerTool('update_todo', {
    title: 'Update Todo',
    description:
      'Update a to-do item. Provide only the fields you want to change. ' +
      'Set status to "done" to complete, "cancelled" to cancel, or "open" to reopen.',
    inputSchema: {
      id: z.string().uuid().describe('The UUID of the todo to update'),
      text: z.string().min(1).max(5000).optional().describe('New text'),
      project: z.string().max(200).optional().describe('Override project'),
      priority: z.number().int().min(1).max(3).optional().describe(
        'New priority: 1 = high, 2 = medium, 3 = low'
      ),
      tags: coercedStringArray.optional().describe(
        'Updated tags. Accepts array or comma-separated string.'
      ),
      status: todoStatusEnum.optional().describe(
        'New status: "done", "cancelled", or "open" to reopen'
      ),
      related_learning_id: z.string().uuid().optional().describe(
        'Link to a learning by ID. Set to null to unlink.'
      ),
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false,
    },
  }, async (args) => {
    return updateTodoTool(args);
  });

  server.registerTool('delete_todo', {
    title: 'Delete Todo',
    description: 'Permanently delete a to-do item.',
    inputSchema: {
      id: z.string().uuid().describe('The UUID of the todo to delete'),
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: false,
      openWorldHint: false,
    },
  }, async (args) => {
    return deleteTodoTool(args);
  });

  return server;
}

export function checkEnvVars(): void {
  const missing: string[] = [];
  if (!process.env.SUPABASE_DB_URL) missing.push('SUPABASE_DB_URL');
  if (!process.env.OPENAI_API_KEY) missing.push('OPENAI_API_KEY');
  if (!process.env.AWS_REGION) missing.push('AWS_REGION');

  if (missing.length > 0) {
    console.error(`FATAL: Missing required environment variables: ${missing.join(', ')}`);
    process.exit(1);
  }
}
