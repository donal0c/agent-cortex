import { generateEmbedding } from '../services/embeddings.js';
import { extractMetadata } from '../services/extraction.js';
import { getLearningById, updateLearning } from '../db/queries.js';
import type { LearningExamples, SourceType } from '../types/index.js';

interface UpdateArgs {
  id: string;
  pattern?: string;
  rationale?: string;
  source_type?: SourceType;
  source_ref?: string;
  project?: string;
  codebase_areas?: string[];
  tags?: string[];
  examples?: LearningExamples;
  active?: boolean;
  deprecated_reason?: string;
  reinforce?: boolean;
  reinforce_note?: string;
}

export async function updateLearningTool(args: UpdateArgs) {
  const existing = await getLearningById(args.id);
  if (!existing) {
    return {
      content: [{ type: 'text' as const, text: `Learning not found: ${args.id}` }],
      isError: true,
    };
  }

  // Validate: deprecating requires a reason
  if (args.active === false && !args.deprecated_reason) {
    return {
      content: [{ type: 'text' as const, text: 'deprecated_reason is required when setting active to false' }],
      isError: true,
    };
  }

  // Validate: reinforce only works on active learnings
  if (args.reinforce && !existing.active) {
    return {
      content: [{ type: 'text' as const, text: `Cannot reinforce a deprecated learning: ${args.id}` }],
      isError: true,
    };
  }

  let embedding: number[] | undefined;

  // Re-generate embedding if pattern changed
  if (args.pattern && args.pattern !== existing.pattern) {
    const embeddingText = args.rationale
      ? `${args.pattern}\n\n${args.rationale}`
      : args.pattern;

    const [newEmbedding, extracted] = await Promise.all([
      generateEmbedding(embeddingText),
      extractMetadata(args.pattern),
    ]);

    embedding = newEmbedding;

    // Use extracted metadata as defaults if not explicitly provided
    if (!args.codebase_areas) args.codebase_areas = extracted.codebase_areas;
    if (!args.tags) args.tags = extracted.tags;
  }

  const updated = await updateLearning({
    id: args.id,
    pattern: args.pattern,
    rationale: args.reinforce ? undefined : args.rationale,
    source_type: args.source_type,
    source_ref: args.source_ref,
    project: args.project,
    codebase_areas: args.codebase_areas,
    tags: args.tags,
    examples: args.examples,
    embedding,
    active: args.active,
    deprecated_reason: args.deprecated_reason,
    reinforce: args.reinforce,
    reinforce_note: args.reinforce_note,
  });

  if (!updated) {
    return {
      content: [{ type: 'text' as const, text: `Failed to update learning: ${args.id}` }],
      isError: true,
    };
  }

  // Build a contextual message
  let message = 'Learning updated';
  if (args.reinforce) {
    message = `Confidence increased to ${updated.confidence}`;
  } else if (args.active === false) {
    message = 'Learning deprecated';
  } else if (args.active === true && !existing.active) {
    message = 'Learning reactivated';
  }

  return {
    content: [
      {
        type: 'text' as const,
        text: JSON.stringify({ ...updated, message }, null, 2),
      },
    ],
  };
}
