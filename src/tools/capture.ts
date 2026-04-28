import { generateEmbedding } from '../services/embeddings.js';
import { extractMetadata } from '../services/extraction.js';
import { insertLearning, findDuplicates } from '../db/queries.js';
import type { LearningExamples, SourceType } from '../types/index.js';

interface CaptureArgs {
  pattern: string;
  rationale?: string;
  source_type?: SourceType;
  source_ref?: string;
  project?: string;
  codebase_areas?: string[];
  tags?: string[];
  examples?: LearningExamples;
  force?: boolean;
}

export async function captureLearning(args: CaptureArgs) {
  const embeddingText = args.rationale
    ? `${args.pattern}\n\n${args.rationale}`
    : args.pattern;

  // Generate embedding and extract metadata in parallel
  const [embedding, extracted] = await Promise.all([
    generateEmbedding(embeddingText),
    extractMetadata(args.pattern, args.source_type),
  ]);

  const project = args.project ?? 'global';

  // Duplicate detection (skip if force=true)
  if (!args.force) {
    const duplicates = await findDuplicates(args.pattern, embedding, project);

    if (duplicates.length > 0) {
      const best = duplicates[0];
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(
              {
                duplicate_warning: true,
                message: `Similar learning found (${Math.round(best.similarity * 100)}% match). ` +
                  `Consider reinforcing the existing learning instead. ` +
                  `To capture anyway, set force=true.`,
                existing_learning: {
                  id: best.id,
                  pattern: best.pattern,
                  project: best.project,
                  confidence: best.confidence,
                  similarity: Math.round(best.similarity * 1000) / 1000,
                },
                all_matches: duplicates.map((d) => ({
                  id: d.id,
                  similarity: Math.round(d.similarity * 1000) / 1000,
                  pattern: d.pattern.length > 100 ? d.pattern.slice(0, 100) + '...' : d.pattern,
                })),
              },
              null,
              2
            ),
          },
        ],
      };
    }
  }

  const learning = await insertLearning({
    pattern: args.pattern,
    rationale: args.rationale,
    source_type: args.source_type ?? extracted.source_type,
    source_ref: args.source_ref,
    project,
    codebase_areas: args.codebase_areas ?? extracted.codebase_areas,
    tags: args.tags ?? extracted.tags,
    examples: args.examples ?? {},
    confidence: 1,
    embedding,
  });

  return {
    content: [
      {
        type: 'text' as const,
        text: JSON.stringify(
          {
            id: learning.id,
            pattern: learning.pattern,
            project: learning.project,
            codebase_areas: learning.codebase_areas,
            tags: learning.tags,
            source_type: learning.source_type,
            confidence: learning.confidence,
            created_at: learning.created_at,
          },
          null,
          2
        ),
      },
    ],
  };
}
