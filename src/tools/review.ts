import { getStats } from '../db/queries.js';

export async function reviewLearnings() {
  const stats = await getStats();

  return {
    content: [
      {
        type: 'text' as const,
        text: JSON.stringify(stats, null, 2),
      },
    ],
  };
}
