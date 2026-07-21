import { createOpenAI } from '@ai-sdk/openai';
import { generateText, tool } from 'ai';
import assert from 'node:assert/strict';
import { z } from 'zod';

type CapturedCall = {
  requestBody?: Record<string, any>;
  responseBody?: Record<string, any>;
};

function createSearchTool(strict?: boolean) {
  return tool({
    description: 'Search academic papers using Semantic Scholar API.',
    inputSchema: z.object({
      query: z
        .string()
        .describe(
          'The text to search for. Convert the question to a sensible search query.',
        ),
      limit: z
        .number()
        .int()
        .optional()
        .describe('The maximum number of results to return. Min 5, max 100.'),
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

async function callO3(strict?: boolean) {
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
    model: openai('o3'),
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
  let defaultRun: Awaited<ReturnType<typeof callO3>>;

  try {
    defaultRun = await callO3();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(
      `ISSUE_7082_REPRODUCED: o3 rejected optional tool parameters by default: ${message}`,
    );
    throw error;
  }

  const defaultRequestTool = defaultRun.calls[0]?.requestBody?.tools?.[0];
  assert.deepEqual(defaultRequestTool?.parameters?.required, ['query']);
  assert.equal('strict' in defaultRequestTool, false);
  assert.equal(
    defaultRun.result.toolCalls[0]?.toolName,
    'semantic_scholar_search',
  );

  console.log(
    JSON.stringify(
      {
        defaultRun: {
          requestTool: defaultRequestTool,
          toolCall: defaultRun.result.toolCalls[0],
          responseStatus: defaultRun.calls[0]?.responseBody?.status,
        },
      },
      null,
      2,
    ),
  );

  const flexibleRun = await callO3(false);
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
    await callO3(true);
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
