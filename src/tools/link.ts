import { insertLink, getLinkedLearnings } from '../db/queries.js';
import type { LinkRelationship } from '../types/index.js';

interface LinkArgs {
  source_id: string;
  target_id: string;
  relationship: LinkRelationship;
  note?: string;
}

export async function linkLearnings(args: LinkArgs) {
  const link = await insertLink(
    args.source_id,
    args.target_id,
    args.relationship,
    args.note
  );

  return {
    content: [
      {
        type: 'text' as const,
        text: JSON.stringify(
          {
            link_id: link.id,
            source_id: link.source_id,
            target_id: link.target_id,
            relationship: link.relationship,
            note: link.note,
            message: 'Learnings linked',
          },
          null,
          2
        ),
      },
    ],
  };
}

interface GetLinkedArgs {
  id: string;
  relationship?: LinkRelationship;
}

export async function getLinked(args: GetLinkedArgs) {
  const links = await getLinkedLearnings(args.id, args.relationship);

  if (links.length === 0) {
    return {
      content: [
        {
          type: 'text' as const,
          text: `No linked learnings found for: ${args.id}`,
        },
      ],
    };
  }

  return {
    content: [
      {
        type: 'text' as const,
        text: JSON.stringify({ count: links.length, links }, null, 2),
      },
    ],
  };
}

