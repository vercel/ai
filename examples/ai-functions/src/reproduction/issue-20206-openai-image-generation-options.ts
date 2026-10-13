import { createOpenAI } from '@ai-sdk/openai';
import { generateText } from 'ai';

type DocumentedImageGenerationArgs = {
  action?: 'generate' | 'edit' | 'auto';
  model?: string;
  moderation?: 'auto' | 'low';
  size?: string;
};

const cases: Array<{
  name: string;
  args: DocumentedImageGenerationArgs;
  expectedRequestOptions: Record<string, string>;
}> = [
  {
    name: "moderation: 'auto' baseline",
    args: { moderation: 'auto' },
    expectedRequestOptions: { moderation: 'auto' },
  },
  {
    name: "moderation: 'low'",
    args: { moderation: 'low' },
    expectedRequestOptions: { moderation: 'low' },
  },
  {
    name: "action: 'generate'",
    args: { action: 'generate' },
    expectedRequestOptions: { action: 'generate' },
  },
  {
    name: "action: 'edit'",
    args: { action: 'edit' },
    expectedRequestOptions: { action: 'edit' },
  },
  {
    name: "action: 'auto'",
    args: { action: 'auto' },
    expectedRequestOptions: { action: 'auto' },
  },
  {
    name: 'gpt-image-2 arbitrary divisible-by-16 size',
    args: { model: 'gpt-image-2', size: '1536x864' },
    expectedRequestOptions: { model: 'gpt-image-2', size: '1536x864' },
  },
];

const responseBody = {
  id: 'resp_issue_20206',
  object: 'response',
  created_at: 0,
  status: 'completed',
  error: null,
  incomplete_details: null,
  instructions: null,
  max_output_tokens: null,
  model: 'gpt-5',
  output: [],
  parallel_tool_calls: true,
  previous_response_id: null,
  reasoning: { effort: null, summary: null },
  store: false,
  temperature: 1,
  text: { format: { type: 'text' } },
  tool_choice: 'auto',
  tools: [],
  top_p: 1,
  truncation: 'disabled',
  usage: {
    input_tokens: 0,
    input_tokens_details: { cached_tokens: 0 },
    output_tokens: 0,
    output_tokens_details: { reasoning_tokens: 0 },
    total_tokens: 0,
  },
  user: null,
  metadata: {},
};

async function main() {
  const requestBodies: Array<Record<string, unknown>> = [];

  const openai = createOpenAI({
    apiKey: 'sk-test',
    fetch: async (_input, init) => {
      requestBodies.push(JSON.parse(String(init?.body)));
      return new Response(JSON.stringify(responseBody), {
        headers: { 'content-type': 'application/json' },
      });
    },
  });

  const failures: string[] = [];

  for (const testCase of cases) {
    const requestCountBefore = requestBodies.length;

    try {
      await generateText({
        model: openai('gpt-5'),
        prompt: 'Draw a cat.',
        tools: {
          image_generation: openai.tools.imageGeneration(
            testCase.args as Parameters<typeof openai.tools.imageGeneration>[0],
          ),
        },
      });
    } catch (error) {
      if (
        error instanceof Error &&
        error.name === 'AI_TypeValidationError' &&
        requestBodies.length === requestCountBefore
      ) {
        failures.push(`${testCase.name} was rejected before fetch`);
        continue;
      }

      throw error;
    }

    const requestBody = requestBodies.at(-1);
    const imageGenerationTool = (
      requestBody?.tools as Array<Record<string, unknown>> | undefined
    )?.find(tool => tool.type === 'image_generation');

    if (imageGenerationTool == null) {
      throw new Error(
        `Expected ${testCase.name} to send an image_generation tool.`,
      );
    }

    for (const [key, expectedValue] of Object.entries(
      testCase.expectedRequestOptions,
    )) {
      if (imageGenerationTool[key] !== expectedValue) {
        failures.push(
          `${testCase.name} reached fetch without forwarding ${key}: ${expectedValue}`,
        );
      }
    }
  }

  if (failures.length > 0) {
    console.error(
      `ISSUE_20206_REPRODUCED: documented OpenAI image generation options were not sent: ${failures.join(
        '; ',
      )}`,
    );
    process.exitCode = 1;
    return;
  }

  console.log(
    'All documented OpenAI image generation options reached fetch with the expected request fields.',
  );
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
