import { createAmazonBedrock } from '@ai-sdk/amazon-bedrock';
import { generateText } from 'ai';
import { readFile } from 'node:fs/promises';

const fixtureDirectory = new URL(
  '../../../../packages/amazon-bedrock/src/__fixtures__/',
  import.meta.url,
);

async function readFixture(name: string) {
  return readFile(new URL(name, fixtureDirectory), 'utf8');
}

async function main() {
  const [reasoningConfigError, reasoningEffortError, success] =
    await Promise.all([
      readFixture('amazon-bedrock-openai-cris-reasoning-config-error.json'),
      readFixture('amazon-bedrock-openai-cris-reasoning-effort-error.json'),
      readFixture('amazon-bedrock-openai-cris-reasoning-success.json'),
    ]);

  const bedrock = createAmazonBedrock({
    apiKey: 'reproduction-api-key',
    region: 'us-east-1',
    fetch: async (_input, init) => {
      const body = JSON.parse(String(init?.body));
      const fields = body.additionalModelRequestFields;

      if (
        fields?.reasoning?.effort === 'high' &&
        fields.reasoningConfig == null &&
        fields.reasoning_effort == null
      ) {
        return new Response(success, {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }

      if (fields?.reasoningConfig != null) {
        return new Response(reasoningConfigError, {
          status: 400,
          headers: { 'content-type': 'application/json' },
        });
      }

      if (fields?.reasoning_effort != null) {
        return new Response(reasoningEffortError, {
          status: 400,
          headers: { 'content-type': 'application/json' },
        });
      }

      return new Response(
        JSON.stringify({
          message:
            'Reproduction harness expected nested reasoning.effort to be sent.',
        }),
        {
          status: 422,
          headers: { 'content-type': 'application/json' },
        },
      );
    },
  });

  const modelIds = [
    'us.openai.gpt-5.6-luna',
    'global.openai.gpt-5.6-luna',
  ] as const;

  const results = await Promise.allSettled(
    modelIds.map(modelId =>
      generateText({
        model: bedrock(modelId),
        prompt: 'Reply with exactly: OK',
        providerOptions: {
          bedrock: {
            reasoningConfig: {
              maxReasoningEffort: 'high',
            },
          },
        },
      }),
    ),
  );

  const rejectedForReasoningConfig = results.filter(
    result =>
      result.status === 'rejected' &&
      String(result.reason).includes("Unknown parameter: 'reasoningConfig'"),
  );

  if (rejectedForReasoningConfig.length > 0) {
    throw new Error(
      'ISSUE #19403 REPRODUCED: CRIS OpenAI requests were rejected because AI SDK sent reasoningConfig.',
    );
  }

  for (const result of results) {
    if (result.status === 'rejected') {
      throw result.reason;
    }
    if (result.value.text !== 'OK') {
      throw new Error(
        `Expected successful text "OK", got ${result.value.text}`,
      );
    }
  }
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
