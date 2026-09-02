import { createOpenAI } from '@ai-sdk/openai';
import { generateText } from 'ai';

type DocumentedImageGenerationArgs = {
  action?: 'generate' | 'edit' | 'auto';
  model?: string;
  moderation?: 'auto' | 'low';
  size?: string;
};

type OpenAIRequest = {
  tools?: Array<Record<string, unknown>>;
};

const responseBody = {
  id: 'r',
  object: 'response',
  status: 'completed',
  model: 'gpt-5',
  output: [],
  usage: {
    input_tokens: 0,
    output_tokens: 0,
    total_tokens: 0,
  },
};

async function main() {
  const requests: OpenAIRequest[] = [];
  const openai = createOpenAI({
    apiKey: 'sk-test',
    fetch: async (_input, init) => {
      requests.push((await new Response(init?.body).json()) as OpenAIRequest);

      return new Response(JSON.stringify(responseBody), {
        headers: { 'content-type': 'application/json' },
      });
    },
  });

  const runCase = async ({
    args,
    expectedToolFields,
  }: {
    args: DocumentedImageGenerationArgs;
    expectedToolFields: Record<string, unknown>;
  }) => {
    const requestCountBefore = requests.length;

    await generateText({
      model: openai('gpt-5'),
      prompt: 'Draw a cat.',
      tools: {
        image_generation: openai.tools.imageGeneration(args as never),
      },
    });

    if (requests.length !== requestCountBefore + 1) {
      throw new Error('Expected exactly one OpenAI request.');
    }

    const imageGenerationTool = requests
      .at(-1)
      ?.tools?.find(tool => tool.type === 'image_generation');

    if (imageGenerationTool == null) {
      throw new Error('Expected an image_generation tool in the request.');
    }

    for (const [key, value] of Object.entries(expectedToolFields)) {
      if (imageGenerationTool[key] !== value) {
        throw new Error(
          `Expected image_generation.${key} to equal ${JSON.stringify(value)}.`,
        );
      }
    }
  };

  // Establish that the stubbed request path works for an option accepted by the
  // current schema.
  await runCase({
    args: { moderation: 'auto' },
    expectedToolFields: { moderation: 'auto' },
  });

  const documentedCases = [
    {
      label: 'moderation=low',
      args: { moderation: 'low' },
      expectedToolFields: { moderation: 'low' },
    },
    {
      label: 'action=generate',
      args: { action: 'generate' },
      expectedToolFields: { action: 'generate' },
    },
    {
      label: 'action=edit',
      args: { action: 'edit' },
      expectedToolFields: { action: 'edit' },
    },
    {
      label: 'action=auto',
      args: { action: 'auto' },
      expectedToolFields: { action: 'auto' },
    },
    {
      label: 'size=1536x864',
      args: { model: 'gpt-image-2', size: '1536x864' },
      expectedToolFields: { model: 'gpt-image-2', size: '1536x864' },
    },
  ] satisfies Array<{
    label: string;
    args: DocumentedImageGenerationArgs;
    expectedToolFields: Record<string, unknown>;
  }>;

  const rejectedBeforeFetch: string[] = [];

  for (const testCase of documentedCases) {
    const requestCountBefore = requests.length;

    try {
      await runCase(testCase);
    } catch (error) {
      if (
        error instanceof Error &&
        error.name === 'AI_TypeValidationError' &&
        requests.length === requestCountBefore
      ) {
        rejectedBeforeFetch.push(testCase.label);
        continue;
      }

      throw error;
    }
  }

  if (rejectedBeforeFetch.length > 0) {
    console.error(
      `ISSUE_20206_REPRODUCED: documented image_generation options were rejected before fetch: ${rejectedBeforeFetch.join(', ')}`,
    );
    process.exitCode = 1;
    return;
  }

  console.log(
    'All documented image_generation options were included in OpenAI requests.',
  );
}

void main();
