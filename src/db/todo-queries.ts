import { sql } from './client.js';
import { pgArray } from './queries.js';
import type {
  InsertTodoParams,
  ListTodosParams,
  Todo,
  UpdateTodoParams,
} from '../types/index.js';

export async function insertTodo(params: InsertTodoParams): Promise<Todo> {
  const project = params.project ?? 'global';
  const priority = params.priority ?? 2;
  const tags = params.tags ?? [];

  const rows = await sql<Todo[]>`
    INSERT INTO todos (text, project, priority, tags, related_learning_id)
    VALUES (
      ${params.text},
      ${project},
      ${priority},
      ${pgArray(tags)}::text[],
      ${params.related_learning_id ?? null}
    )
    RETURNING id, text, project, priority, status, related_learning_id,
              tags, created_at, completed_at, updated_at
  `;
  return rows[0];
}

export async function listTodos(params: ListTodosParams): Promise<Todo[]> {
  const limit = params.limit ?? 20;
  const conditions: ReturnType<typeof sql>[] = [];

  // Default to open todos
  const status = params.status ?? 'open';
  conditions.push(sql`status = ${status}`);

  if (params.project) {
    conditions.push(sql`(project = ${params.project} OR project = 'global')`);
  }

  if (params.priority !== undefined) {
    conditions.push(sql`priority = ${params.priority}`);
  }

  if (params.from_date) {
    conditions.push(sql`created_at >= ${params.from_date}::timestamptz`);
  }

  if (params.to_date) {
    conditions.push(sql`created_at < (${params.to_date}::date + INTERVAL '1 day')`);
  }

  const whereClause = conditions.reduce(
    (acc, cond, i) => (i === 0 ? cond : sql`${acc} AND ${cond}`)
  );

  return sql<Todo[]>`
    SELECT id, text, project, priority, status, related_learning_id,
           tags, created_at, completed_at, updated_at
    FROM todos
    WHERE ${whereClause}
    ORDER BY priority ASC, created_at DESC
    LIMIT ${limit}
  `;
}

export async function updateTodo(params: UpdateTodoParams): Promise<Todo | null> {
  const setClauses: ReturnType<typeof sql>[] = [];

  if (params.text !== undefined) {
    setClauses.push(sql`text = ${params.text}`);
  }
  if (params.project !== undefined) {
    setClauses.push(sql`project = ${params.project}`);
  }
  if (params.priority !== undefined) {
    setClauses.push(sql`priority = ${params.priority}`);
  }
  if (params.tags !== undefined) {
    setClauses.push(sql`tags = ${pgArray(params.tags)}::text[]`);
  }
  if (params.related_learning_id !== undefined) {
    setClauses.push(sql`related_learning_id = ${params.related_learning_id}`);
  }
  if (params.status !== undefined) {
    setClauses.push(sql`status = ${params.status}`);
    if (params.status === 'done' || params.status === 'cancelled') {
      setClauses.push(sql`completed_at = NOW()`);
    } else if (params.status === 'open') {
      setClauses.push(sql`completed_at = ${null}`);
    }
  }

  if (setClauses.length === 0) {
    // Nothing to update — return current state
    const rows = await sql<Todo[]>`
      SELECT id, text, project, priority, status, related_learning_id,
             tags, created_at, completed_at, updated_at
      FROM todos WHERE id = ${params.id}
    `;
    return rows[0] ?? null;
  }

  const setClause = setClauses.reduce(
    (acc, clause, i) => (i === 0 ? clause : sql`${acc}, ${clause}`)
  );

  const rows = await sql<Todo[]>`
    UPDATE todos
    SET ${setClause}
    WHERE id = ${params.id}
    RETURNING id, text, project, priority, status, related_learning_id,
              tags, created_at, completed_at, updated_at
  `;
  return rows[0] ?? null;
}

export async function deleteTodo(id: string): Promise<Todo | null> {
  const rows = await sql<Todo[]>`
    DELETE FROM todos WHERE id = ${id}
    RETURNING id, text, project, priority, status, related_learning_id,
              tags, created_at, completed_at, updated_at
  `;
  return rows[0] ?? null;
}
