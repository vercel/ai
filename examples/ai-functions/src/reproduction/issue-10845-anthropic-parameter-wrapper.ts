import {
  createAnthropic,
  type AnthropicLanguageModelOptions,
} from '@ai-sdk/anthropic';
import { generateObject, NoObjectGeneratedError } from 'ai';
import { readFileSync } from 'node:fs';
import { z } from 'zod';

const MODEL = 'claude-sonnet-4-5';
const WRAPPER_PATTERN = /"\$(?:PARAMETER_NAME|PARAMETER|JSON)"\s*:/;

const analysisSchema = z.object({
  event: z.enum(['CREATE', 'COMMENT', 'UPDATE']),
  title: z.string(),
  summary: z.string(),
  imageDescription: z.string(),
  category: z.enum(['portrait', 'animal', 'document', 'landscape', 'other']),
  confidence: z.number(),
  tags: z.array(
    z.enum([
      'personal',
      'professional',
      'urgent',
      'follow-up',
      'visual',
      'textual',
    ]),
  ),
  detectedObjects: z.array(
    z.object({
      name: z.string(),
      count: z.number().int(),
      prominence: z.enum(['primary', 'secondary', 'background']),
      evidence: z.string(),
    }),
  ),
  colors: z.array(
    z.object({
      name: z.string(),
      hex: z.string(),
      proportion: z.number(),
    }),
  ),
  quality: z.object({
    lighting: z.enum(['poor', 'fair', 'good', 'excellent']),
    sharpness: z.enum(['poor', 'fair', 'good', 'excellent']),
    composition: z.enum(['poor', 'fair', 'good', 'excellent']),
    notes: z.array(z.string()),
  }),
  personalizedInsights: z.array(
    z.object({
      contextKey: z.string(),
      insight: z.string(),
      relevance: z.enum(['low', 'medium', 'high']),
    }),
  ),
  recommendations: z.array(
    z.object({
      action: z.string(),
      priority: z.enum(['low', 'medium', 'high']),
      rationale: z.string(),
    }),
  ),
  metadata: z.object({
    source: z.enum(['vision', 'cached-text']),
    taxonomyIds: z.array(z.string()),
    requiresReview: z.boolean(),
  }),
});

type Scenario = 'vision' | 'cached-text';
type Mode = 'auto' | 'jsonTool';

type RequestRecord = {
  label: string;
  body: Record<string, unknown>;
};

const requestRecords: RequestRecord[] = [];
let activeLabel = 'unassigned';

const provider = createAnthropic({
  fetch: async (input, init) => {
    if (typeof init?.body === 'string') {
      requestRecords.push({
        label: activeLabel,
        body: JSON.parse(init.body) as Record<string, unknown>,
      });
    }

    return fetch(input, init);
  },
});

const visionSystemPrompt = `
You are a personalized media-analysis engine. Follow the supplied schema
exactly. The user's downstream code requires a direct object matching the
schema. Respond with JSON only. Never add prose, markdown, or a wrapper.
Use the user's preferences and history when selecting tags, insights, and
recommendations. Every required field must be present.
`.trim();

const personalizedContext = Array.from({ length: 90 }, (_, index) => {
  const id = String(index + 1).padStart(3, '0');
  return [
    `Preference P-${id}: the user values concise evidence-backed analysis`,
    `and maps observations to taxonomy T-${id}`,
    `with a preference for ${
      index % 3 === 0 ? 'professional' : index % 3 === 1 ? 'personal' : 'visual'
    } follow-up actions.`,
  ].join(' ');
}).join('\n');

const visionPrompt = `
Analyze the attached image for user account ACME-2048.
Respond with JSON matching the schema. Do not describe the schema itself.
For metadata.source use "vision". Use at least one detected object, color,
personalized insight, recommendation, and taxonomy ID.

Personalized user context:
${personalizedContext}
`.trim();

const taxonomy = Array.from({ length: 220 }, (_, index) => {
  const id = String(index + 1).padStart(3, '0');
  return `T-${id}: classify evidence by subject, visual prominence, business relevance, confidence, review urgency, and a concise personalized recommendation.`;
}).join('\n');

const cachedSystemPrompt = `
You are a deterministic extraction engine for a personalized content system.
Use the taxonomy below and return a direct JSON object matching the supplied
schema. Respond with JSON only. Do not wrap the object in $PARAMETER_NAME,
$PARAMETER, $JSON, or any other property.

TAXONOMY:
${taxonomy}
`.trim();

const cachedContext = `
Account: ACME-2048
Source: cached text, no image.
Observed subject: a cat sitting beside a laptop during a code review.
Dominant colors: orange, gray, and black.
Quality: good lighting, excellent sharpness, good composition.
Relevant taxonomy IDs: T-004, T-019, T-088, T-144.
User preference: concise professional comments with one high-priority action.
`.trim();

function providerOptions(mode: Mode) {
  const anthropicOptions = {
    structuredOutputMode: mode,
  } satisfies AnthropicLanguageModelOptions;

  return {
    anthropic: anthropicOptions,
  };
}

function getMessages(scenario: Scenario) {
  if (scenario === 'vision') {
    return [
      {
        role: 'system' as const,
        content: visionSystemPrompt,
      },
      {
        role: 'user' as const,
        content: [
          { type: 'text' as const, text: visionPrompt },
          {
            type: 'image' as const,
            image: readFileSync('data/comic-cat.png'),
          },
        ],
      },
    ];
  }

  return [
    {
      role: 'system' as const,
      content: cachedSystemPrompt,
      providerOptions: {
        anthropic: {
          cacheControl: { type: 'ephemeral' as const },
        },
      },
    },
    {
      role: 'user' as const,
      content: cachedContext,
      providerOptions: {
        anthropic: {
          cacheControl: { type: 'ephemeral' as const },
        },
      },
    },
    {
      role: 'assistant' as const,
      content:
        'I have loaded the account context and taxonomy. I will use the requested schema.',
    },
    {
      role: 'user' as const,
      content:
        'Extract the final analysis now. Respond with JSON only. For metadata.source use "cached-text".',
    },
  ];
}

function countCacheBreakpoints(value: unknown): number {
  if (Array.isArray(value)) {
    return value.reduce(
      (count, item) => count + countCacheBreakpoints(item),
      0,
    );
  }

  if (value == null || typeof value !== 'object') {
    return 0;
  }

  const record = value as Record<string, unknown>;
  return Object.values(record).reduce<number>(
    (count, item) => count + countCacheBreakpoints(item),
    'cache_control' in record ? 1 : 0,
  );
}

function requestShape(body: Record<string, unknown>) {
  const outputConfig = body.output_config as { format?: unknown } | undefined;
  const tools = body.tools as Array<{ name?: string }> | undefined;
  const messages = body.messages as
    | Array<{ content?: Array<{ type?: string }> }>
    | undefined;

  return {
    usesOutputFormat: outputConfig?.format != null,
    usesJsonTool: tools?.some(tool => tool.name === 'json') ?? false,
    hasImage:
      messages?.some(message =>
        message.content?.some(part => part.type === 'image'),
      ) ?? false,
    cacheBreakpoints: countCacheBreakpoints(body),
  };
}

async function runAttempt({
  scenario,
  mode,
  attempt,
}: {
  scenario: Scenario;
  mode: Mode;
  attempt: number;
}) {
  activeLabel = `${scenario}/${mode}/${attempt}`;

  try {
    const result = await generateObject({
      model: provider(MODEL),
      schema: analysisSchema,
      messages: getMessages(scenario),
      allowSystemInMessages: true,
      providerOptions: providerOptions(mode),
      maxOutputTokens: 2_000,
      maxRetries: 0,
    });

    analysisSchema.parse(result.object);

    if (WRAPPER_PATTERN.test(JSON.stringify(result.object))) {
      throw new Error(
        `ISSUE_10845_REPRODUCED: ${activeLabel} returned a wrapper object`,
      );
    }

    console.log(
      JSON.stringify({
        label: activeLabel,
        result: 'schema-valid direct object',
        finishReason: result.finishReason,
      }),
    );
  } catch (error) {
    if (
      NoObjectGeneratedError.isInstance(error) &&
      error.text != null &&
      WRAPPER_PATTERN.test(error.text)
    ) {
      console.error(error.text);
      throw new Error(
        `ISSUE_10845_REPRODUCED: ${activeLabel} failed schema validation with a $PARAMETER_NAME-style wrapper`,
      );
    }

    throw error;
  }
}

async function main() {
  console.log(
    JSON.stringify({
      model: MODEL,
      visionPromptCharacters: visionPrompt.length,
      cachedSystemPromptCharacters: cachedSystemPrompt.length,
    }),
  );

  for (const scenario of ['vision', 'cached-text'] as const) {
    for (let attempt = 1; attempt <= 3; attempt++) {
      await runAttempt({ scenario, mode: 'auto', attempt });
    }
  }

  for (const scenario of ['vision', 'cached-text'] as const) {
    await runAttempt({ scenario, mode: 'jsonTool', attempt: 1 });
  }

  for (const request of requestRecords) {
    console.log(
      JSON.stringify({
        label: request.label,
        requestShape: requestShape(request.body),
      }),
    );
  }

  console.log(
    'ISSUE_10845_NOT_REPRODUCED: all 8 live calls returned schema-valid direct objects',
  );
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
