import { getLearningById } from '../db/queries.js';

interface GetArgs {
  id: string;
}

export async function getLearning(args: GetArgs) {
  const learning = await getLearningById(args.id);

  if (!learning) {
    return {
      content: [{ type: 'text' as const, text: `Learning not found: ${args.id}` }],
      isError: true,
    };
  }

  return {
    content: [
      {
        type: 'text' as const,
        text: JSON.stringify(learning, null, 2),
      },
    ],
  };
}
