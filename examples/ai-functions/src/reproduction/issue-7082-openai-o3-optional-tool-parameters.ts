import { createOpenAI } from '@ai-sdk/openai';
import { generateText, tool } from 'ai';
import assert from 'node:assert/strict';
import { z } from 'zod';

type CapturedCall = {
  requestBody?: Record<string, any>;
  responseBody?: Record<string, any>;
};

const modelId = process.env.ISSUE_7082_MODEL ?? 'o3';
const schemaVariant = process.env.ISSUE_7082_SCHEMA_VARIANT ?? 'optional';

function createSearchTool(strict?: boolean) {
  const limit = z.number().int();
  const limitSchema =
    schemaVariant === 'default'
      ? limit.default(10)
      : schemaVariant === 'nullish'
        ? limit.nullish()
        : schemaVariant === 'nullable'
          ? limit.nullable()
          : limit.optional();

  return tool({
    description: 'Search academic papers using Semantic Scholar API.',
    inputSchema: z.object({
      query: z
        .string()
        .describe(
          'The text to search for. Convert the question to a sensible search query.',
        ),
      limit: limitSchema.describe(
        'The maximum number of results to return. Min 5, max 100.',
      ),
      offset: z
        .number()
        .int()
        .nonnegative()
        .optional()
        .describe('The pagination offset.'),
      year: z
        .number()
        .int()
        .optional()
        .describe('The publication year, formatted as YYYY.'),
    }),
    ...(strict == null ? {} : { strict }),
  });
}

async function callModel(strict?: boolean) {
  const calls: CapturedCall[] = [];
  const openai = createOpenAI({
    fetch: async (input, init) => {
      const call: CapturedCall = {
        requestBody:
          typeof init?.body === 'string' ? JSON.parse(init.body) : undefined,
      };
      calls.push(call);

      const response = await fetch(input, init);
      call.responseBody = await response
        .clone()
        .json()
        .catch(() => undefined);
      return response;
    },
  });

  const result = await generateText({
    model: openai(modelId),
    prompt: 'Search for papers about machine learning.',
    tools: {
      semantic_scholar_search: createSearchTool(strict),
    },
    toolChoice: {
      type: 'tool',
      toolName: 'semantic_scholar_search',
    },
  });

  return { calls, result };
}

async function main() {
  let defaultRun: Awaited<ReturnType<typeof callModel>>;

  try {
    defaultRun = await callModel();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(
      `ISSUE_7082_REPRODUCED: ${modelId} rejected optional tool parameters by default: ${message}`,
    );
    throw error;
  }

  const defaultRequestTool = defaultRun.calls[0]?.requestBody?.tools?.[0];
  assert.deepEqual(
    defaultRequestTool?.parameters?.required,
    schemaVariant === 'nullable' ? ['query', 'limit'] : ['query'],
  );
  assert.equal('strict' in defaultRequestTool, false);
  assert.equal(
    defaultRun.result.toolCalls[0]?.toolName,
    'semantic_scholar_search',
  );

  console.log(
    JSON.stringify(
      {
        defaultRun: {
          modelId,
          schemaVariant,
          requestTool: defaultRequestTool,
          toolCall: defaultRun.result.toolCalls[0],
          responseStatus: defaultRun.calls[0]?.responseBody?.status,
        },
      },
      null,
      2,
    ),
  );

  if (process.env.ISSUE_7082_DEFAULT_ONLY === '1') {
    return;
  }

  const flexibleRun = await callModel(false);
  const flexibleRequestTool = flexibleRun.calls[0]?.requestBody?.tools?.[0];
  assert.equal(flexibleRequestTool?.strict, false);
  assert.equal(
    flexibleRun.result.toolCalls[0]?.toolName,
    'semantic_scholar_search',
  );
  console.log(
    `strictFalseRun: accepted: ${JSON.stringify(flexibleRun.result.toolCalls[0]?.input)}`,
  );

  try {
    await callModel(true);
    console.log('strictRun: accepted');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.log(`strictRun: rejected: ${message}`);
  }
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
