import { createMoonshotAI } from '../../../../packages/moonshotai/src';
import { readFileSync } from 'node:fs';

const officialMoonshotV1ModelIds = [
  'moonshot-v1-8k',
  'moonshot-v1-32k',
  'moonshot-v1-128k',
  'moonshot-v1-auto',
  'moonshot-v1-8k-vision-preview',
  'moonshot-v1-32k-vision-preview',
  'moonshot-v1-128k-vision-preview',
] as const;

const liveResponse = JSON.parse(
  readFileSync(
    new URL(
      '../../../../packages/moonshotai/src/__fixtures__/moonshotai-v1-structured-output.json',
      import.meta.url,
    ),
    'utf8',
  ),
);

async function main() {
  const responseFormatTypes = new Map<string, string | undefined>();
  const provider = createMoonshotAI({
    apiKey: 'reproduction-api-key',
    fetch: async (input, init) => {
      const body = JSON.parse(String(init?.body));
      responseFormatTypes.set(body.model, body.response_format?.type);

      return new Response(JSON.stringify(liveResponse), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    },
  });

  const checkRequest = async (modelId: string) => {
    await provider.chatModel(modelId).doGenerate({
      prompt: [
        {
          role: 'user',
          content: [{ type: 'text', text: 'Return a value.' }],
        },
      ],
      responseFormat: {
        type: 'json',
        name: 'result',
        schema: {
          type: 'object',
          properties: { value: { type: 'string' } },
          required: ['value'],
          additionalProperties: false,
        },
      },
    });
  };

  for (const modelId of officialMoonshotV1ModelIds) {
    await checkRequest(modelId);
  }
  await checkRequest('unknown-custom-model');
  await checkRequest('kimi-k3');

  const downgradedModelIds = officialMoonshotV1ModelIds.filter(
    modelId => responseFormatTypes.get(modelId) !== 'json_schema',
  );

  if (responseFormatTypes.get('unknown-custom-model') !== 'json_object') {
    throw new Error(
      'Unknown Moonshot model no longer preserves the json_object fallback.',
    );
  }

  console.log(
    `Observed Kimi K3 response format on release-v5.0: ${responseFormatTypes.get('kimi-k3')}`,
  );

  if (downgradedModelIds.length > 0) {
    throw new Error(
      `Moonshot V1 structured output downgrade: expected json_schema for official models, received json_object for ${downgradedModelIds.join(', ')}`,
    );
  }

  console.log(
    'All official Moonshot V1 models use native json_schema structured output.',
  );
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
