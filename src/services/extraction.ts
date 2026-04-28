import {
  BedrockRuntimeClient,
  InvokeModelCommand,
} from '@aws-sdk/client-bedrock-runtime';
import type { ExtractedMetadata, SourceType } from '../types/index.js';

const VALID_SOURCE_TYPES: SourceType[] = [
  'pr_review', 'code_review', 'debugging',
  'convention', 'architecture_decision', 'observation',
  'idea', 'note', 'preference', 'reference', 'troubleshooting',
];

function isValidSourceType(value: string): value is SourceType {
  return VALID_SOURCE_TYPES.includes(value as SourceType);
}

let bedrockClient: BedrockRuntimeClient | null = null;

function getClient(): BedrockRuntimeClient {
  if (!bedrockClient) {
    bedrockClient = new BedrockRuntimeClient({
      region: process.env.AWS_REGION || 'us-east-1',
    });
  }
  return bedrockClient;
}

const EXTRACTION_PROMPT = `Analyze the following learning/pattern and extract structured metadata. Return ONLY valid JSON with no additional text.

{
  "codebase_areas": ["2-4 areas of code this applies to"],
  "tags": ["2-5 categorization tags"],
  "source_type": "one of: pr_review, code_review, debugging, convention, architecture_decision, observation, idea, note, preference, reference, troubleshooting"
}

Rules:
- codebase_areas: architectural layers or domains where this pattern applies.
  Examples: repository, transformer, API, service, middleware, hook, migration,
  testing, configuration, deployment, authentication, database, frontend, CLI,
  infrastructure, monitoring, validation, serialization, error-handling, types
- tags: descriptive categorization keywords.
  Examples: error-handling, naming-convention, performance, security, testing-pattern,
  type-safety, code-style, anti-pattern, best-practice, refactoring, dependency-management
- source_type: choose the best fit for what this knowledge represents.
  pr_review = from a pull request review, code_review = from a code review session,
  debugging = discovered while debugging, convention = team/project convention,
  architecture_decision = architectural choice, observation = general observation,
  idea = a possibility or thing to explore later, note = general notes or context,
  preference = personal/team preference for tools or workflows,
  reference = a link, doc, or external resource worth saving,
  troubleshooting = a solution to a specific problem or workaround

Learning to analyze:
`;

export async function extractMetadata(
  pattern: string,
  explicitSourceType?: SourceType
): Promise<ExtractedMetadata> {
  const modelId = process.env.BEDROCK_MODEL_ID || 'us.anthropic.claude-sonnet-4-6';

  const command = new InvokeModelCommand({
    modelId,
    contentType: 'application/json',
    accept: 'application/json',
    body: JSON.stringify({
      anthropic_version: 'bedrock-2023-05-31',
      max_tokens: 1024,
      temperature: 0,
      messages: [
        {
          role: 'user',
          content: EXTRACTION_PROMPT + pattern,
        },
      ],
    }),
  });

  const response = await getClient().send(command);
  const responseBody = JSON.parse(new TextDecoder().decode(response.body));
  let text: string = responseBody.content[0].text;

  // Strip accidental markdown fences
  text = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(text);
  } catch {
    console.error('Failed to parse extraction response:', text);
    return {
      codebase_areas: [],
      tags: [],
      source_type: explicitSourceType ?? 'observation',
    };
  }

  const codebase_areas = Array.isArray(parsed.codebase_areas)
    ? parsed.codebase_areas.filter((a): a is string => typeof a === 'string')
    : [];

  const tags = Array.isArray(parsed.tags)
    ? parsed.tags.filter((t): t is string => typeof t === 'string')
    : [];

  const source_type =
    typeof parsed.source_type === 'string' && isValidSourceType(parsed.source_type)
      ? parsed.source_type
      : 'observation';

  return {
    codebase_areas,
    tags,
    source_type: explicitSourceType ?? source_type,
  };
}
