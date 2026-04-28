export type SourceType =
  | 'pr_review'
  | 'code_review'
  | 'debugging'
  | 'convention'
  | 'architecture_decision'
  | 'observation'
  | 'idea'
  | 'note'
  | 'preference'
  | 'reference'
  | 'troubleshooting';

export type LinkRelationship =
  | 'relates_to'
  | 'supersedes'
  | 'contradicts'
  | 'reinforces'
  | 'specializes';

export interface Learning {
  id: string;
  pattern: string;
  rationale: string | null;
  source_type: SourceType;
  source_ref: string | null;
  project: string;
  codebase_areas: string[];
  tags: string[];
  examples: LearningExamples;
  confidence: number;
  active: boolean;
  deprecated_reason: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface LearningExamples {
  good?: string;
  bad?: string;
  context?: string;
}

export interface LearningWithScore extends Learning {
  similarity: number;
}

export interface ExtractedMetadata {
  codebase_areas: string[];
  tags: string[];
  source_type: SourceType;
}

export interface InsertLearningParams {
  pattern: string;
  rationale?: string;
  source_type: SourceType;
  source_ref?: string;
  project: string;
  codebase_areas: string[];
  tags: string[];
  examples: LearningExamples;
  confidence: number;
  embedding: number[];
}

export interface UpdateLearningParams {
  id: string;
  pattern?: string;
  rationale?: string;
  source_type?: SourceType;
  source_ref?: string;
  project?: string;
  codebase_areas?: string[];
  tags?: string[];
  examples?: LearningExamples;
  embedding?: number[];
  active?: boolean;
  deprecated_reason?: string | null;
  reinforce?: boolean;
  reinforce_note?: string;
}

export interface FilterLearningsParams {
  tags?: string[];
  source_type?: SourceType;
  project?: string;
  codebase_areas?: string[];
  from_date?: string;
  to_date?: string;
  min_confidence?: number;
  include_deprecated?: boolean;
  limit?: number;
}

export interface LearningLink {
  id: string;
  source_id: string;
  target_id: string;
  relationship: LinkRelationship;
  note: string | null;
  created_at: Date;
}

export interface LearningLinkWithLearning extends LearningLink {
  linked_learning: Learning;
}

export interface LearningStats {
  total_learnings: number;
  active_learnings: number;
  deprecated_learnings: number;
  by_project: Record<string, number>;
  by_source_type: Record<string, number>;
  top_areas: Array<{ area: string; count: number }>;
  top_tags: Array<{ tag: string; count: number }>;
  avg_confidence: number;
  learnings_last_7_days: number;
  learnings_last_30_days: number;
}

// --- Todo types ---

export type TodoStatus = 'open' | 'done' | 'cancelled';

export interface Todo {
  id: string;
  text: string;
  project: string;
  priority: number;
  status: TodoStatus;
  related_learning_id: string | null;
  tags: string[];
  created_at: Date;
  completed_at: Date | null;
  updated_at: Date;
}

export interface InsertTodoParams {
  text: string;
  project?: string;
  priority?: number;
  tags?: string[];
  related_learning_id?: string;
}

export interface UpdateTodoParams {
  id: string;
  text?: string;
  project?: string;
  priority?: number;
  tags?: string[];
  status?: TodoStatus;
  related_learning_id?: string | null;
}

export interface ListTodosParams {
  status?: TodoStatus;
  project?: string;
  priority?: number;
  from_date?: string;
  to_date?: string;
  limit?: number;
}
