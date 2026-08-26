import { createXai } from '@ai-sdk/xai';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { generateText, streamText } from 'ai';

const generateFixtureUrl = new URL(
  '../../../../packages/xai/src/responses/__fixtures__/issue-19652-live-generate.json',
  import.meta.url,
);
const streamFixtureUrl = new URL(
  '../../../../packages/xai/src/responses/__fixtures__/issue-19652-live-stream.chunks.txt',
  import.meta.url,
);

function addUnknownUsageFields(usage: any) {
  return {
    ...usage,
    future_top_level_usage: { sentinel: 'top-level' },
    input_tokens_details: {
      ...usage.input_tokens_details,
      future_input_detail: { sentinel: 'input-detail' },
    },
    output_tokens_details: {
      ...usage.output_tokens_details,
      future_output_detail: { sentinel: 'output-detail' },
    },
  };
}

async function main() {
  const generateResponse = JSON.parse(
    await fs.readFile(generateFixtureUrl, 'utf8'),
  );
  const streamEvent = JSON.parse(
    (await fs.readFile(streamFixtureUrl, 'utf8')).trim(),
  );

  const expectedGenerateUsage = addUnknownUsageFields(generateResponse.usage);
  const expectedStreamUsage = addUnknownUsageFields(streamEvent.response.usage);
  generateResponse.usage = expectedGenerateUsage;
  streamEvent.response.usage = expectedStreamUsage;
  const initialStreamEvent = {
    type: 'response.created',
    response: {
      id: 'initial-response',
      model: 'grok-4.6',
      object: 'response',
      output: [],
      status: 'in_progress',
      usage: addUnknownUsageFields({
        input_tokens: 1,
        output_tokens: 2,
        total_tokens: 3,
        input_tokens_details: { cached_tokens: 0 },
        output_tokens_details: { reasoning_tokens: 0 },
      }),
    },
  };

  const provider = createXai({
    apiKey: 'fixture-key',
    fetch: async (_input, init) => {
      const isStream =
        typeof init?.body === 'string' && init.body.includes('"stream":true');

      if (isStream) {
        return new Response(
          [
            `data: ${JSON.stringify(initialStreamEvent)}\n\n`,
            `data: ${JSON.stringify(streamEvent)}\n\n`,
            'data: [DONE]\n\n',
          ].join(''),
          {
            status: 200,
            headers: { 'content-type': 'text/event-stream' },
          },
        );
      }

      return new Response(JSON.stringify(generateResponse), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    },
  });

  const generated = await generateText({
    model: provider.responses('grok-4.6'),
    prompt: 'Replay the recorded xAI Responses fixture.',
  });

  const streamed = streamText({
    model: provider.responses('grok-4.6'),
    prompt: 'Replay the recorded xAI Responses streaming fixture.',
  });
  for await (const _part of streamed.fullStream) {
    // Consume the complete stream so the terminal usage is available.
  }
  const streamedUsage = await streamed.usage;

  assert.deepEqual(
    {
      inputTokens: generated.usage.inputTokens,
      noCacheTokens: generated.usage.inputTokenDetails.noCacheTokens,
      cacheReadTokens: generated.usage.inputTokenDetails.cacheReadTokens,
      outputTokens: generated.usage.outputTokens,
      textTokens: generated.usage.outputTokenDetails.textTokens,
      reasoningTokens: generated.usage.outputTokenDetails.reasoningTokens,
    },
    {
      inputTokens: 5165,
      noCacheTokens: 4013,
      cacheReadTokens: 1152,
      outputTokens: 891,
      textTokens: 31,
      reasoningTokens: 860,
    },
  );
  assert.deepEqual(
    {
      inputTokens: streamedUsage.inputTokens,
      noCacheTokens: streamedUsage.inputTokenDetails.noCacheTokens,
      cacheReadTokens: streamedUsage.inputTokenDetails.cacheReadTokens,
      outputTokens: streamedUsage.outputTokens,
      textTokens: streamedUsage.outputTokenDetails.textTokens,
      reasoningTokens: streamedUsage.outputTokenDetails.reasoningTokens,
    },
    {
      inputTokens: 5467,
      noCacheTokens: 4315,
      cacheReadTokens: 1152,
      outputTokens: 593,
      textTokens: 18,
      reasoningTokens: 575,
    },
  );

  const rawUsageWasPreserved =
    JSON.stringify(generated.usage.raw) ===
      JSON.stringify(expectedGenerateUsage) &&
    JSON.stringify(streamedUsage.raw) === JSON.stringify(expectedStreamUsage);

  if (!rawUsageWasPreserved) {
    console.error(
      JSON.stringify(
        {
          generate: {
            providerUsage: expectedGenerateUsage,
            sdkRaw: generated.usage.raw,
          },
          stream: {
            providerUsage: expectedStreamUsage,
            sdkRaw: streamedUsage.raw,
          },
        },
        null,
        2,
      ),
    );
    throw new Error(
      'Reproduced issue #19652: xAI Responses usage.raw dropped provider-returned fields.',
    );
  }
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
