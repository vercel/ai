import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { createOpenAI } from '../../../../packages/openai/dist/index.mjs';
import {
  APICallError,
  generateText,
  tool,
} from '../../../../packages/ai/dist/index.mjs';
import { z } from '../../../ai-core/node_modules/zod/index.js';

const fixturePath =
  '../../packages/openai/src/responses/__fixtures__/issue-7082-o3-optional-tool-parameters.json';

const requests: Array<Record<string, any>> = [];
const responses: Array<unknown> = [];

const openai = createOpenAI({
  fetch: async (url, init) => {
    requests.push(JSON.parse(init?.body as string));

    const response = await fetch(url, init);
    const responseText = await response.clone().text();

    try {
      responses.push(JSON.parse(responseText));
    } catch {
      responses.push(responseText);
    }

    return response;
  },
});

const semanticScholarSearch = tool({
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
      .describe('Restrict results to this publication year.'),
  }),
});

async function generate(strictJsonSchema?: boolean) {
  return generateText({
    model: openai('o3'),
    maxOutputTokens: 1000,
    tools: {
      semantic_scholar_search: semanticScholarSearch,
    },
    toolChoice: {
      type: 'tool',
      toolName: 'semantic_scholar_search',
    },
    prompt: 'Search for papers about machine learning.',
    ...(strictJsonSchema == null
      ? {}
      : {
          providerOptions: {
            openai: { strictJsonSchema },
          },
        }),
  });
}

async function main() {
  const result = await generate();

  const defaultRequestTool = requests[0]?.tools?.[0];
  assert.equal(defaultRequestTool?.name, 'semantic_scholar_search');
  assert.equal(defaultRequestTool?.strict, false);
  assert.deepEqual(defaultRequestTool?.parameters?.required, ['query']);
  assert.deepEqual(Object.keys(defaultRequestTool?.parameters?.properties), [
    'query',
    'limit',
    'offset',
    'year',
  ]);

  assert.equal(result.toolCalls.length, 1);
  assert.equal(result.toolCalls[0]?.toolName, 'semantic_scholar_search');
  assert.equal(typeof result.toolCalls[0]?.input.query, 'string');

  try {
    await fs.writeFile(
      fixturePath,
      `${JSON.stringify(responses[0], null, 2)}\n`,
      {
        encoding: 'utf8',
        flag: 'wx',
      },
    );
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') {
      throw error;
    }
  }

  let strictError: unknown;
  try {
    await generate(true);
  } catch (error) {
    strictError = error;
  }

  assert.ok(
    APICallError.isInstance(strictError),
    'strictJsonSchema: true should reject this non-strict schema',
  );
  assert.match(
    strictError.responseBody ?? strictError.message,
    /Missing 'limit'/,
  );

  console.log(
    JSON.stringify(
      {
        defaultRequest: {
          strict: defaultRequestTool.strict,
          required: defaultRequestTool.parameters.required,
        },
        toolCall: result.toolCalls[0],
        strictTrueError: strictError.responseBody,
        fixturePath,
      },
      null,
      2,
    ),
  );
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
