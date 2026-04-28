import { generateEmbedding } from '../services/embeddings.js';
import { hybridSearch } from '../db/queries.js';

interface QueryArgs {
  query: string;
  project?: string;
  include_deprecated?: boolean;
  limit?: number;
}

export async function queryLearnings(args: QueryArgs) {
  const embedding = await generateEmbedding(args.query);

  const results = await hybridSearch(args.query, embedding, {
    project: args.project,
    active: args.include_deprecated ? undefined : true,
    limit: args.limit ?? 10,
  });

  if (results.length === 0) {
    return {
      content: [
        {
          type: 'text' as const,
          text: 'No relevant learnings found.',
        },
      ],
    };
  }

  const formatted = results.map((r) => ({
    id: r.id,
    pattern: r.pattern,
    rationale: r.rationale,
    score: Math.round(r.similarity * 10000) / 10000,
    confidence: r.confidence,
    project: r.project,
    codebase_areas: r.codebase_areas,
    tags: r.tags,
    examples: r.examples,
    source_type: r.source_type,
    source_ref: r.source_ref,
    active: r.active,
  }));

  return {
    content: [
      {
        type: 'text' as const,
        text: JSON.stringify(
          { count: formatted.length, learnings: formatted },
          null,
          2
        ),
      },
    ],
  };
}
