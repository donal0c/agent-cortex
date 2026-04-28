import { sql } from './client.js';
import type {
  FilterLearningsParams,
  InsertLearningParams,
  Learning,
  LearningLink,
  LearningLinkWithLearning,
  LearningStats,
  LearningWithScore,
  LinkRelationship,
  UpdateLearningParams,
} from '../types/index.js';

/** Format a string[] as a PostgreSQL array literal: {"a","b","c"} */
export function pgArray(arr: string[]): string {
  const escaped = arr.map((s) => '"' + s.replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"');
  return '{' + escaped.join(',') + '}';
}

export async function getLearningById(id: string): Promise<Learning | null> {
  const rows = await sql<Learning[]>`
    SELECT id, pattern, rationale, source_type, source_ref, project,
           codebase_areas, tags, examples, confidence, active,
           deprecated_reason, created_at, updated_at
    FROM learnings
    WHERE id = ${id}
  `;
  return rows[0] ?? null;
}

export async function insertLearning(params: InsertLearningParams): Promise<Learning> {
  const rows = await sql<Learning[]>`
    INSERT INTO learnings (
      pattern, rationale, source_type, source_ref, project,
      codebase_areas, tags, examples, confidence, embedding
    ) VALUES (
      ${params.pattern},
      ${params.rationale ?? null},
      ${params.source_type},
      ${params.source_ref ?? null},
      ${params.project},
      ${pgArray(params.codebase_areas)}::text[],
      ${pgArray(params.tags)}::text[],
      ${JSON.stringify(params.examples)}::jsonb,
      ${params.confidence},
      ${JSON.stringify(params.embedding)}::vector
    )
    RETURNING id, pattern, rationale, source_type, source_ref, project,
              codebase_areas, tags, examples, confidence, active,
              deprecated_reason, created_at, updated_at
  `;
  return rows[0];
}

export async function updateLearning(params: UpdateLearningParams): Promise<Learning | null> {
  const setClauses: ReturnType<typeof sql>[] = [];

  if (params.pattern !== undefined) {
    setClauses.push(sql`pattern = ${params.pattern}`);
  }
  if (params.rationale !== undefined) {
    setClauses.push(sql`rationale = ${params.rationale}`);
  }
  if (params.source_type !== undefined) {
    setClauses.push(sql`source_type = ${params.source_type}`);
  }
  if (params.source_ref !== undefined) {
    setClauses.push(sql`source_ref = ${params.source_ref}`);
  }
  if (params.project !== undefined) {
    setClauses.push(sql`project = ${params.project}`);
  }
  if (params.codebase_areas !== undefined) {
    setClauses.push(sql`codebase_areas = ${pgArray(params.codebase_areas)}::text[]`);
  }
  if (params.tags !== undefined) {
    setClauses.push(sql`tags = ${pgArray(params.tags)}::text[]`);
  }
  if (params.examples !== undefined) {
    setClauses.push(sql`examples = ${JSON.stringify(params.examples)}::jsonb`);
  }
  if (params.embedding !== undefined) {
    setClauses.push(sql`embedding = ${JSON.stringify(params.embedding)}::vector`);
  }
  if (params.active !== undefined) {
    setClauses.push(sql`active = ${params.active}`);
    if (params.active === false && params.deprecated_reason) {
      setClauses.push(sql`deprecated_reason = ${params.deprecated_reason}`);
    }
    if (params.active === true) {
      setClauses.push(sql`deprecated_reason = ${null}`);
    }
  }
  if (params.reinforce) {
    setClauses.push(sql`confidence = confidence + 1`);
    if (params.reinforce_note) {
      setClauses.push(
        sql`rationale = COALESCE(rationale, '') || E'\n\n[Reinforced] ' || ${params.reinforce_note}`
      );
    }
  }

  if (setClauses.length === 0) {
    return getLearningById(params.id);
  }

  const setClause = setClauses.reduce(
    (acc, clause, i) => (i === 0 ? clause : sql`${acc}, ${clause}`)
  );

  const rows = await sql<Learning[]>`
    UPDATE learnings
    SET ${setClause}
    WHERE id = ${params.id}
    RETURNING id, pattern, rationale, source_type, source_ref, project,
              codebase_areas, tags, examples, confidence, active,
              deprecated_reason, created_at, updated_at
  `;
  return rows[0] ?? null;
}

export async function reinforceLearning(
  id: string,
  note?: string
): Promise<Learning | null> {
  const setClauses = note
    ? sql`confidence = confidence + 1, rationale = COALESCE(rationale, '') || E'\n\n[Reinforced] ' || ${note}`
    : sql`confidence = confidence + 1`;

  const rows = await sql<Learning[]>`
    UPDATE learnings
    SET ${setClauses}
    WHERE id = ${id} AND active = true
    RETURNING id, pattern, rationale, source_type, source_ref, project,
              codebase_areas, tags, examples, confidence, active,
              deprecated_reason, created_at, updated_at
  `;
  return rows[0] ?? null;
}

export async function deprecateLearning(
  id: string,
  reason: string
): Promise<Learning | null> {
  const rows = await sql<Learning[]>`
    UPDATE learnings
    SET active = false, deprecated_reason = ${reason}
    WHERE id = ${id}
    RETURNING id, pattern, rationale, source_type, source_ref, project,
              codebase_areas, tags, examples, confidence, active,
              deprecated_reason, created_at, updated_at
  `;
  return rows[0] ?? null;
}

export async function reactivateLearning(id: string): Promise<Learning | null> {
  const rows = await sql<Learning[]>`
    UPDATE learnings
    SET active = true, deprecated_reason = null
    WHERE id = ${id}
    RETURNING id, pattern, rationale, source_type, source_ref, project,
              codebase_areas, tags, examples, confidence, active,
              deprecated_reason, created_at, updated_at
  `;
  return rows[0] ?? null;
}

export interface DuplicateCandidate {
  id: string;
  pattern: string;
  project: string;
  confidence: number;
  similarity: number;
}

export async function findDuplicates(
  patternText: string,
  embedding: number[],
  project: string,
  threshold: number = 0.85
): Promise<DuplicateCandidate[]> {
  const embeddingStr = JSON.stringify(embedding);

  // Fast path: exact text match
  const exactMatches = await sql<DuplicateCandidate[]>`
    SELECT id, pattern, project, confidence, 1.0::float AS similarity
    FROM learnings
    WHERE active = true AND pattern = ${patternText}
      AND (project = ${project} OR project = 'global')
    LIMIT 3
  `;
  if (exactMatches.length > 0) return exactMatches;

  // Semantic dedup: cosine similarity check
  return sql<DuplicateCandidate[]>`
    SELECT id, pattern, project, confidence,
           1 - (embedding <=> ${embeddingStr}::vector) AS similarity
    FROM learnings
    WHERE active = true AND embedding IS NOT NULL
      AND (project = ${project} OR project = 'global')
      AND 1 - (embedding <=> ${embeddingStr}::vector) >= ${threshold}
    ORDER BY embedding <=> ${embeddingStr}::vector
    LIMIT 3
  `;
}

export async function hybridSearch(
  queryText: string,
  queryEmbedding: number[],
  options: { project?: string; active?: boolean; limit?: number } = {}
): Promise<LearningWithScore[]> {
  const limit = options.limit ?? 10;
  const candidateLimit = Math.max(limit * 3, 30);
  const embeddingStr = JSON.stringify(queryEmbedding);
  const conditions: ReturnType<typeof sql>[] = [];

  if (options.active !== false) {
    conditions.push(sql`active = true`);
  }

  if (options.project) {
    conditions.push(sql`(project = ${options.project} OR project = 'global')`);
  }

  const baseWhere = conditions.length > 0
    ? conditions.reduce((acc, cond, i) => (i === 0 ? cond : sql`${acc} AND ${cond}`))
    : sql`true`;

  // RRF hybrid search: semantic + full-text in a single query
  // k=60 is the standard RRF smoothing constant
  // keyword_weight=1.5, semantic_weight=1.0 (technical content benefits from keyword bias)
  return sql<LearningWithScore[]>`
    WITH semantic AS (
      SELECT id,
             ROW_NUMBER() OVER (ORDER BY embedding <=> ${embeddingStr}::vector) AS rank
      FROM learnings
      WHERE ${baseWhere} AND embedding IS NOT NULL
      ORDER BY embedding <=> ${embeddingStr}::vector
      LIMIT ${candidateLimit}
    ),
    keyword AS (
      SELECT id,
             ROW_NUMBER() OVER (ORDER BY ts_rank_cd(search_vector, websearch_to_tsquery('english', ${queryText})) DESC) AS rank
      FROM learnings
      WHERE ${baseWhere}
        AND search_vector @@ websearch_to_tsquery('english', ${queryText})
      ORDER BY ts_rank_cd(search_vector, websearch_to_tsquery('english', ${queryText})) DESC
      LIMIT ${candidateLimit}
    ),
    fused AS (
      SELECT COALESCE(s.id, k.id) AS id,
             COALESCE(1.0 / (60 + s.rank), 0) * 1.0 +
             COALESCE(1.0 / (60 + k.rank), 0) * 1.5 AS rrf_score
      FROM semantic s
      FULL OUTER JOIN keyword k ON s.id = k.id
    )
    SELECT l.id, l.pattern, l.rationale, l.source_type, l.source_ref, l.project,
           l.codebase_areas, l.tags, l.examples, l.confidence, l.active,
           l.deprecated_reason, l.created_at, l.updated_at,
           f.rrf_score AS similarity
    FROM fused f
    JOIN learnings l ON l.id = f.id
    ORDER BY f.rrf_score DESC
    LIMIT ${limit}
  `;
}

export async function learningsByArea(
  areas: string[],
  options: { project?: string; limit?: number } = {}
): Promise<Learning[]> {
  const limit = options.limit ?? 20;
  const conditions: ReturnType<typeof sql>[] = [
    sql`active = true`,
    sql`codebase_areas && ${pgArray(areas)}::text[]`,
  ];

  if (options.project) {
    conditions.push(sql`(project = ${options.project} OR project = 'global')`);
  }

  const whereClause = conditions.reduce(
    (acc, cond, i) => (i === 0 ? cond : sql`${acc} AND ${cond}`)
  );

  return sql<Learning[]>`
    SELECT id, pattern, rationale, source_type, source_ref, project,
           codebase_areas, tags, examples, confidence, active,
           deprecated_reason, created_at, updated_at
    FROM learnings
    WHERE ${whereClause}
    ORDER BY confidence DESC, created_at DESC
    LIMIT ${limit}
  `;
}

export async function filterLearnings(params: FilterLearningsParams): Promise<Learning[]> {
  const limit = params.limit ?? 20;
  const conditions: ReturnType<typeof sql>[] = [];

  if (!params.include_deprecated) {
    conditions.push(sql`active = true`);
  }

  if (params.project) {
    conditions.push(sql`(project = ${params.project} OR project = 'global')`);
  }

  if (params.source_type) {
    conditions.push(sql`source_type = ${params.source_type}`);
  }

  if (params.tags && params.tags.length > 0) {
    conditions.push(sql`tags && ${pgArray(params.tags)}::text[]`);
  }

  if (params.codebase_areas && params.codebase_areas.length > 0) {
    conditions.push(sql`codebase_areas && ${pgArray(params.codebase_areas)}::text[]`);
  }

  if (params.from_date) {
    conditions.push(sql`created_at >= ${params.from_date}::timestamptz`);
  }

  if (params.to_date) {
    conditions.push(sql`created_at < (${params.to_date}::date + INTERVAL '1 day')`);
  }

  if (params.min_confidence !== undefined) {
    conditions.push(sql`confidence >= ${params.min_confidence}`);
  }

  const whereClause = conditions.length > 0
    ? conditions.reduce((acc, cond, i) => (i === 0 ? cond : sql`${acc} AND ${cond}`))
    : sql`true`;

  return sql<Learning[]>`
    SELECT id, pattern, rationale, source_type, source_ref, project,
           codebase_areas, tags, examples, confidence, active,
           deprecated_reason, created_at, updated_at
    FROM learnings
    WHERE ${whereClause}
    ORDER BY created_at DESC
    LIMIT ${limit}
  `;
}

export async function getStats(): Promise<LearningStats> {
  const [
    totalResult,
    activeResult,
    deprecatedResult,
    projectResult,
    sourceTypeResult,
    areasResult,
    tagsResult,
    avgConfResult,
    last7Result,
    last30Result,
  ] = await Promise.all([
    sql<[{ count: string }]>`SELECT COUNT(*)::text AS count FROM learnings`,
    sql<[{ count: string }]>`SELECT COUNT(*)::text AS count FROM learnings WHERE active = true`,
    sql<[{ count: string }]>`SELECT COUNT(*)::text AS count FROM learnings WHERE active = false`,
    sql<{ project: string; count: string }[]>`
      SELECT project, COUNT(*)::text AS count
      FROM learnings WHERE active = true
      GROUP BY project ORDER BY count DESC
    `,
    sql<{ source_type: string; count: string }[]>`
      SELECT source_type, COUNT(*)::text AS count
      FROM learnings WHERE active = true
      GROUP BY source_type ORDER BY count DESC
    `,
    sql<{ area: string; count: string }[]>`
      SELECT unnest(codebase_areas) AS area, COUNT(*)::text AS count
      FROM learnings WHERE active = true
      GROUP BY area ORDER BY count DESC LIMIT 20
    `,
    sql<{ tag: string; count: string }[]>`
      SELECT unnest(tags) AS tag, COUNT(*)::text AS count
      FROM learnings WHERE active = true
      GROUP BY tag ORDER BY count DESC LIMIT 20
    `,
    sql<[{ avg: string | null }]>`
      SELECT ROUND(AVG(confidence), 1)::text AS avg
      FROM learnings WHERE active = true
    `,
    sql<[{ count: string }]>`
      SELECT COUNT(*)::text AS count FROM learnings
      WHERE created_at >= NOW() - INTERVAL '7 days'
    `,
    sql<[{ count: string }]>`
      SELECT COUNT(*)::text AS count FROM learnings
      WHERE created_at >= NOW() - INTERVAL '30 days'
    `,
  ]);

  const by_project: Record<string, number> = {};
  for (const row of projectResult) {
    by_project[row.project] = parseInt(row.count, 10);
  }

  const by_source_type: Record<string, number> = {};
  for (const row of sourceTypeResult) {
    by_source_type[row.source_type] = parseInt(row.count, 10);
  }

  return {
    total_learnings: parseInt(totalResult[0].count, 10),
    active_learnings: parseInt(activeResult[0].count, 10),
    deprecated_learnings: parseInt(deprecatedResult[0].count, 10),
    by_project,
    by_source_type,
    top_areas: areasResult.map((r) => ({ area: r.area, count: parseInt(r.count, 10) })),
    top_tags: tagsResult.map((r) => ({ tag: r.tag, count: parseInt(r.count, 10) })),
    avg_confidence: parseFloat(avgConfResult[0].avg ?? '0'),
    learnings_last_7_days: parseInt(last7Result[0].count, 10),
    learnings_last_30_days: parseInt(last30Result[0].count, 10),
  };
}

// --- Link operations ---

export async function insertLink(
  sourceId: string,
  targetId: string,
  relationship: LinkRelationship,
  note?: string
): Promise<LearningLink> {
  const rows = await sql<LearningLink[]>`
    INSERT INTO learning_links (source_id, target_id, relationship, note)
    VALUES (${sourceId}, ${targetId}, ${relationship}, ${note ?? null})
    RETURNING id, source_id, target_id, relationship, note, created_at
  `;
  return rows[0];
}

export async function getLinkedLearnings(
  learningId: string,
  relationship?: LinkRelationship
): Promise<LearningLinkWithLearning[]> {
  if (relationship) {
    return sql<LearningLinkWithLearning[]>`
      SELECT
        ll.id, ll.source_id, ll.target_id, ll.relationship, ll.note, ll.created_at,
        l.id AS "linked_learning.id",
        l.pattern AS "linked_learning.pattern",
        l.rationale AS "linked_learning.rationale",
        l.source_type AS "linked_learning.source_type",
        l.source_ref AS "linked_learning.source_ref",
        l.project AS "linked_learning.project",
        l.codebase_areas AS "linked_learning.codebase_areas",
        l.tags AS "linked_learning.tags",
        l.examples AS "linked_learning.examples",
        l.confidence AS "linked_learning.confidence",
        l.active AS "linked_learning.active",
        l.deprecated_reason AS "linked_learning.deprecated_reason",
        l.created_at AS "linked_learning.created_at",
        l.updated_at AS "linked_learning.updated_at"
      FROM learning_links ll
      JOIN learnings l ON (
        CASE WHEN ll.source_id = ${learningId} THEN ll.target_id ELSE ll.source_id END = l.id
      )
      WHERE (ll.source_id = ${learningId} OR ll.target_id = ${learningId})
        AND ll.relationship = ${relationship}
      ORDER BY ll.created_at DESC
    `;
  }

  return sql<LearningLinkWithLearning[]>`
    SELECT
      ll.id, ll.source_id, ll.target_id, ll.relationship, ll.note, ll.created_at,
      l.id AS "linked_learning.id",
      l.pattern AS "linked_learning.pattern",
      l.rationale AS "linked_learning.rationale",
      l.source_type AS "linked_learning.source_type",
      l.source_ref AS "linked_learning.source_ref",
      l.project AS "linked_learning.project",
      l.codebase_areas AS "linked_learning.codebase_areas",
      l.tags AS "linked_learning.tags",
      l.examples AS "linked_learning.examples",
      l.confidence AS "linked_learning.confidence",
      l.active AS "linked_learning.active",
      l.deprecated_reason AS "linked_learning.deprecated_reason",
      l.created_at AS "linked_learning.created_at",
      l.updated_at AS "linked_learning.updated_at"
    FROM learning_links ll
    JOIN learnings l ON (
      CASE WHEN ll.source_id = ${learningId} THEN ll.target_id ELSE ll.source_id END = l.id
    )
    WHERE ll.source_id = ${learningId} OR ll.target_id = ${learningId}
    ORDER BY ll.created_at DESC
  `;
}

export async function deleteLinkById(linkId: string): Promise<LearningLink | null> {
  const rows = await sql<LearningLink[]>`
    DELETE FROM learning_links WHERE id = ${linkId}
    RETURNING id, source_id, target_id, relationship, note, created_at
  `;
  return rows[0] ?? null;
}
