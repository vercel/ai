import { createMoonshotAI } from '@ai-sdk/moonshotai';
import { generateText, Output } from 'ai';
import { z } from 'zod';

const officialMoonshotV1ModelIds = [
  'moonshot-v1-8k',
  'moonshot-v1-32k',
  'moonshot-v1-128k',
  'moonshot-v1-auto',
  'moonshot-v1-8k-vision-preview',
  'moonshot-v1-32k-vision-preview',
  'moonshot-v1-128k-vision-preview',
] as const;

async function main() {
  const requestBodies = new Map<string, Record<string, any>>();
  const provider = createMoonshotAI({
    apiKey: 'test-api-key',
    fetch: async (_input, init) => {
      const requestBody = JSON.parse(String(init?.body));
      requestBodies.set(requestBody.model, requestBody);

      return new Response(
        JSON.stringify({
          id: 'chatcmpl-reproduction',
          object: 'chat.completion',
          created: 1787685013,
          model: requestBody.model,
          choices: [
            {
              index: 0,
              message: {
                role: 'assistant',
                content: '{"greeting":"hello"}',
              },
              finish_reason: 'stop',
            },
          ],
          usage: {
            prompt_tokens: 10,
            completion_tokens: 5,
            total_tokens: 15,
          },
        }),
        { headers: { 'content-type': 'application/json' } },
      );
    },
  });

  async function generateStructuredOutput(modelId: string) {
    await generateText({
      model: provider(modelId),
      output: Output.object({
        name: 'greeting_response',
        schema: z.object({ greeting: z.literal('hello') }),
      }),
      prompt: 'Return an object with greeting set to hello.',
    });
  }

  for (const modelId of officialMoonshotV1ModelIds) {
    await generateStructuredOutput(modelId);
  }
  await generateStructuredOutput('kimi-k3');
  await generateStructuredOutput('custom-model-id');

  const kimiFormat = requestBodies.get('kimi-k3')?.response_format?.type;
  if (kimiFormat !== 'json_schema') {
    throw new Error(
      `Unexpected Kimi behavior: expected json_schema, received ${String(kimiFormat)}`,
    );
  }

  const customFormat =
    requestBodies.get('custom-model-id')?.response_format?.type;
  if (customFormat !== 'json_object') {
    throw new Error(
      `Unexpected custom-model behavior: expected json_object, received ${String(customFormat)}`,
    );
  }

  const downgradedModelIds = officialMoonshotV1ModelIds.filter(
    modelId =>
      requestBodies.get(modelId)?.response_format?.type !== 'json_schema',
  );

  if (downgradedModelIds.length > 0) {
    throw new Error(
      `Moonshot V1 structured-output downgrade reproduced: expected json_schema for official models, received json_object for: ${downgradedModelIds.join(', ')}`,
    );
  }

  console.log(
    'All official Moonshot V1 models sent native json_schema response formats.',
  );
}

main();
