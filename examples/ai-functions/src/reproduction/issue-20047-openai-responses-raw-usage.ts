import { createOpenAI } from '@ai-sdk/openai';
import { generateText, streamText } from 'ai';
import assert from 'node:assert/strict';

type JsonObject = Record<string, unknown>;

const providerUsage: {
  normal?: JsonObject;
  streaming?: JsonObject;
} = {};

const capturePromises: Promise<void>[] = [];

function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseStreamingUsage(body: string): JsonObject {
  for (const line of body.split('\n').reverse()) {
    if (!line.startsWith('data: ')) {
      continue;
    }

    const event: unknown = JSON.parse(line.slice('data: '.length));
    if (
      isJsonObject(event) &&
      (event.type === 'response.completed' ||
        event.type === 'response.incomplete' ||
        event.type === 'response.failed') &&
      isJsonObject(event.response) &&
      isJsonObject(event.response.usage)
    ) {
      return event.response.usage;
    }
  }

  throw new Error('OpenAI stream did not contain terminal response usage');
}

const capturingFetch: typeof fetch = async (input, init) => {
  const requestBody =
    typeof init?.body === 'string'
      ? (JSON.parse(init.body) as { stream?: boolean })
      : {};
  const response = await fetch(input, init);
  const clone = response.clone();

  if (requestBody.stream === true) {
    capturePromises.push(
      clone.text().then(body => {
        providerUsage.streaming = parseStreamingUsage(body);
      }),
    );
  } else {
    capturePromises.push(
      clone.json().then((body: unknown) => {
        assert.ok(isJsonObject(body) && isJsonObject(body.usage));
        providerUsage.normal = body.usage;
      }),
    );
  }

  return response;
};

function droppedFields(
  boundary: JsonObject,
  raw: unknown,
): { topLevel: string[]; deepEqual: boolean } {
  const rawObject = isJsonObject(raw) ? raw : {};

  return {
    topLevel: Object.keys(boundary).filter(key => !(key in rawObject)),
    deepEqual: JSON.stringify(boundary) === JSON.stringify(raw),
  };
}

async function main() {
  const openai = createOpenAI({ fetch: capturingFetch });
  const model = openai.responses('gpt-4o-mini');
  const prompt = 'Reply with exactly: OK';

  const normalResult = await generateText({ model, prompt });

  const streamingResult = streamText({ model, prompt });
  await streamingResult.text;
  const streamingFinalStep = await streamingResult.finalStep;

  await Promise.all(capturePromises);

  assert.ok(providerUsage.normal);
  assert.ok(providerUsage.streaming);
  assert.equal(typeof providerUsage.normal.total_tokens, 'number');
  assert.equal(typeof providerUsage.streaming.total_tokens, 'number');

  assert.equal(
    normalResult.finalStep.usage.totalTokens,
    providerUsage.normal.total_tokens,
  );
  assert.equal(
    streamingFinalStep.usage.totalTokens,
    providerUsage.streaming.total_tokens,
  );

  const normal = droppedFields(
    providerUsage.normal,
    normalResult.finalStep.usage.raw,
  );
  const streaming = droppedFields(
    providerUsage.streaming,
    streamingFinalStep.usage.raw,
  );

  if (!normal.deepEqual || !streaming.deepEqual) {
    console.error(
      `Issue #20047 reproduced: OpenAI Responses usage.raw dropped provider fields: normal=${normal.topLevel.join(',')}; streaming=${streaming.topLevel.join(',')}`,
    );
    process.exitCode = 1;
    return;
  }

  console.log(
    'OpenAI Responses usage.raw preserved the complete provider usage objects.',
  );
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
