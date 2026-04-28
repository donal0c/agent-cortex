import { insertTodo, listTodos, updateTodo, deleteTodo } from '../db/todo-queries.js';
import type { TodoStatus } from '../types/index.js';

// --- Capture ---

interface CaptureArgs {
  text: string;
  project?: string;
  priority?: number;
  tags?: string[];
  related_learning_id?: string;
}

export async function captureTodo(args: CaptureArgs) {
  const todo = await insertTodo(args);

  return {
    content: [
      {
        type: 'text' as const,
        text: JSON.stringify(todo, null, 2),
      },
    ],
  };
}

// --- List ---

interface ListArgs {
  status?: TodoStatus;
  project?: string;
  priority?: number;
  from_date?: string;
  to_date?: string;
  limit?: number;
}

export async function listTodosTool(args: ListArgs) {
  const results = await listTodos(args);

  if (results.length === 0) {
    return {
      content: [
        {
          type: 'text' as const,
          text: 'No todos match the given filters.',
        },
      ],
    };
  }

  return {
    content: [
      {
        type: 'text' as const,
        text: JSON.stringify({ count: results.length, todos: results }, null, 2),
      },
    ],
  };
}

// --- Update ---

interface UpdateArgs {
  id: string;
  text?: string;
  project?: string;
  priority?: number;
  tags?: string[];
  status?: TodoStatus;
  related_learning_id?: string | null;
}

export async function updateTodoTool(args: UpdateArgs) {
  const updated = await updateTodo(args);

  if (!updated) {
    return {
      content: [{ type: 'text' as const, text: `Todo not found: ${args.id}` }],
      isError: true,
    };
  }

  let message = 'Todo updated';
  if (args.status === 'done') {
    message = 'Todo completed';
  } else if (args.status === 'cancelled') {
    message = 'Todo cancelled';
  } else if (args.status === 'open') {
    message = 'Todo reopened';
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

// --- Delete ---

interface DeleteArgs {
  id: string;
}

export async function deleteTodoTool(args: DeleteArgs) {
  const deleted = await deleteTodo(args.id);

  if (!deleted) {
    return {
      content: [{ type: 'text' as const, text: `Todo not found: ${args.id}` }],
      isError: true,
    };
  }

  return {
    content: [
      {
        type: 'text' as const,
        text: JSON.stringify({ ...deleted, message: 'Todo deleted' }, null, 2),
      },
    ],
  };
}
