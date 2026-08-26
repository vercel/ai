import { createCohere } from '@ai-sdk/cohere';
import type { JSONObject } from '@ai-sdk/provider';
import { generateText, streamText, type LanguageModelUsage } from 'ai';
import assert from 'node:assert/strict';
import { isDeepStrictEqual } from 'node:util';

const modelId = 'command-a-03-2025';

const jsonUsage: JSONObject[] = [];
const streamUsage: JSONObject[] = [];

function getUsage(value: unknown): JSONObject {
  assert.ok(
    value != null && typeof value === 'object' && !Array.isArray(value),
  );

  const usage = (value as { usage?: unknown }).usage;
  assert.ok(
    usage != null && typeof usage === 'object' && !Array.isArray(usage),
  );

  return usage as JSONObject;
}

function captureStreamUsage(body: string) {
  for (const block of body.split(/\r?\n\r?\n/)) {
    const data = block
      .split(/\r?\n/)
      .filter(line => line.startsWith('data:'))
      .map(line => line.slice('data:'.length).trimStart())
      .join('\n');

    if (data.length === 0 || data === '[DONE]') {
      continue;
    }

    const event = JSON.parse(data) as {
      type?: string;
      delta?: { usage?: JSONObject };
    };

    if (event.type === 'message-end' && event.delta?.usage != null) {
      streamUsage.push(event.delta.usage);
    }
  }
}

const capturingFetch: typeof fetch = async (input, init) => {
  const response = await fetch(input, init);

  if (response.ok) {
    const clonedResponse = response.clone();
    const contentType = response.headers.get('content-type');

    if (contentType?.includes('text/event-stream')) {
      captureStreamUsage(await clonedResponse.text());
    } else {
      jsonUsage.push(getUsage(await clonedResponse.json()));
    }
  }

  return response;
};

function assertNormalizedUsage(
  label: string,
  providerUsage: JSONObject,
  sdkUsage: LanguageModelUsage,
) {
  const tokens = providerUsage.tokens as JSONObject;

  assert.equal(
    sdkUsage.inputTokens,
    tokens.input_tokens,
    `${label} normalized input tokens must continue to come from usage.tokens`,
  );
  assert.equal(
    sdkUsage.outputTokens,
    tokens.output_tokens,
    `${label} normalized output tokens must continue to come from usage.tokens`,
  );
}

async function main() {
  const provider = createCohere({ fetch: capturingFetch });

  const generated = await generateText({
    model: provider(modelId),
    prompt: 'Reply with one short word.',
    maxOutputTokens: 5,
    maxRetries: 0,
  });

  const streamed = streamText({
    model: provider(modelId),
    prompt: 'Reply with one short word.',
    maxOutputTokens: 5,
    maxRetries: 0,
  });
  await streamed.text;

  assert.equal(jsonUsage.length, 1, 'Expected one JSON usage object');
  assert.equal(streamUsage.length, 1, 'Expected one terminal SSE usage object');

  const generatedUsage = generated.finalStep.usage;
  const streamedUsage = (await streamed.finalStep).usage;

  assertNormalizedUsage('generateText', jsonUsage[0], generatedUsage);
  assertNormalizedUsage('streamText', streamUsage[0], streamedUsage);

  const mismatchedPaths = [
    !isDeepStrictEqual(generatedUsage.raw, jsonUsage[0]) && 'generateText',
    !isDeepStrictEqual(streamedUsage.raw, streamUsage[0]) && 'streamText',
  ].filter(Boolean);

  if (mismatchedPaths.length > 0) {
    console.error(
      JSON.stringify(
        {
          mismatchedPaths,
          generateText: {
            providerUsage: jsonUsage[0],
            sdkRawUsage: generatedUsage.raw,
          },
          streamText: {
            providerUsage: streamUsage[0],
            sdkRawUsage: streamedUsage.raw,
          },
        },
        null,
        2,
      ),
    );
    throw new Error(
      'Reproduced issue #19736: Cohere final-step usage.raw does not preserve complete provider usage objects',
    );
  }
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
