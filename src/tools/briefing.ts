import { generateEmbedding } from '../services/embeddings.js';
import { hybridSearch } from '../db/queries.js';
import type { LearningWithScore } from '../types/index.js';

interface BriefingArgs {
  task: string;
  project?: string;
  limit?: number;
}

interface BriefingItem {
  id: string;
  project: string;
  confidence: number;
  score: number;
  pointer: string | null;
  pattern: string;
  tags: string[];
}

const MAX_PATTERN_LENGTH = 360;
const MIN_POINTER_TOKEN_OVERLAP = 2;
const MIN_LEARNING_TOKEN_OVERLAP = 2;
const STOP_WORDS = new Set([
  'about',
  'agent',
  'alludium',
  'around',
  'before',
  'briefing',
  'current',
  'doing',
  'from',
  'into',
  'need',
  'project',
  'platform',
  'starting',
  'state',
  'task',
  'that',
  'this',
  'work',
  'working',
]);

function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 3).trimEnd()}...`;
}

function looksLikeFilePointer(sourceRef: string | null): boolean {
  if (!sourceRef) return false;
  return (
    sourceRef.startsWith('/') ||
    sourceRef.startsWith('memory/') ||
    sourceRef.startsWith('notes/') ||
    sourceRef.startsWith('research/') ||
    sourceRef.includes('.md')
  );
}

function tokenSet(text: string): Set<string> {
  const tokens = text
    .toLowerCase()
    .match(/[a-z][a-z0-9-]{2,}/g) ?? [];
  return new Set(tokens.filter((token) => !STOP_WORDS.has(token)));
}

function overlapCount(taskTokens: Set<string>, learning: LearningWithScore): number {
  const haystack = tokenSet([
    learning.pattern,
    learning.rationale ?? '',
    learning.source_ref ?? '',
    learning.project,
    ...learning.codebase_areas,
    ...learning.tags,
  ].join(' '));

  let count = 0;
  for (const token of taskTokens) {
    if (haystack.has(token)) count += 1;
  }
  return count;
}

function isBriefingCandidate(taskTokens: Set<string>, learning: LearningWithScore): boolean {
  if (/^\s*todo\s*:/i.test(learning.pattern)) return false;
  if (looksLikeFilePointer(learning.source_ref)) return overlapCount(taskTokens, learning) >= MIN_POINTER_TOKEN_OVERLAP;
  return learning.confidence >= 2 && overlapCount(taskTokens, learning) >= MIN_LEARNING_TOKEN_OVERLAP;
}

function formatBriefingItem(learning: LearningWithScore): BriefingItem {
  return {
    id: learning.id,
    project: learning.project,
    confidence: learning.confidence,
    score: Math.round(learning.similarity * 10000) / 10000,
    pointer: looksLikeFilePointer(learning.source_ref) ? learning.source_ref : null,
    pattern: truncate(learning.pattern, MAX_PATTERN_LENGTH),
    tags: learning.tags.slice(0, 8),
  };
}

export async function getBriefing(args: BriefingArgs) {
  const limit = Math.min(Math.max(args.limit ?? 5, 1), 5);
  const candidateLimit = Math.max(limit * 5, 25);
  const taskTokens = tokenSet(args.task);
  const embedding = await generateEmbedding(args.task);

  const results = await hybridSearch(args.task, embedding, {
    project: args.project,
    active: true,
    limit: candidateLimit,
  });
  const filtered = results
    .filter((learning) => isBriefingCandidate(taskTokens, learning))
    .slice(0, limit);

  if (filtered.length === 0) {
    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify(
            {
              task: args.task,
              project: args.project ?? null,
              count: 0,
              guidance: 'No relevant Agent Cortex briefing items found. Continue without deep memory lookup unless the user asks for one.',
              items: [],
            },
            null,
            2
          ),
        },
      ],
    };
  }

  const items = filtered.map(formatBriefingItem);
  const pointerCount = items.filter((item) => item.pointer).length;

  return {
    content: [
      {
        type: 'text' as const,
        text: JSON.stringify(
          {
            task: args.task,
            project: args.project ?? null,
            count: items.length,
            guidance:
              pointerCount > 0
                ? 'Use these as progressive-disclosure pointers. Open only the canonical files that are clearly relevant to the task.'
                : 'These are concise Cortex learnings, not canonical wiki content. Apply only items that clearly match the task.',
            items,
          },
          null,
          2
        ),
      },
    ],
  };
}
