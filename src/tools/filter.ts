import { filterLearnings } from '../db/queries.js';
import type { FilterLearningsParams } from '../types/index.js';

export async function filterLearningsTool(args: FilterLearningsParams) {
  const results = await filterLearnings(args);

  if (results.length === 0) {
    return {
      content: [
        {
          type: 'text' as const,
          text: 'No learnings match the given filters.',
        },
      ],
    };
  }

  const formatted = results.map((r) => ({
    id: r.id,
    pattern: r.pattern,
    rationale: r.rationale,
    confidence: r.confidence,
    project: r.project,
    codebase_areas: r.codebase_areas,
    tags: r.tags,
    source_type: r.source_type,
    source_ref: r.source_ref,
    active: r.active,
    created_at: r.created_at,
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
