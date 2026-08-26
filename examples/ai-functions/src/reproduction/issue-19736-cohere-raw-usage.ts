import { createCohere } from '@ai-sdk/cohere';
import type { JSONObject } from '@ai-sdk/provider';
import { generateText, streamText } from 'ai';
import { isDeepStrictEqual } from 'node:util';

type CapturedUsage = {
  json?: JSONObject;
  stream?: JSONObject;
};

function extractStreamingUsage(body: string): JSONObject {
  for (const block of body.split('\n\n')) {
    const data = block
      .split('\n')
      .filter(line => line.startsWith('data:'))
      .map(line => line.slice('data:'.length).trim())
      .join('\n');

    if (data === '') {
      continue;
    }

    const event = JSON.parse(data) as {
      type?: string;
      delta?: { usage?: JSONObject };
    };

    if (event.type === 'message-end' && event.delta?.usage != null) {
      return event.delta.usage;
    }
  }

  throw new Error('Cohere stream did not contain terminal usage');
}

function getTokenCounts(usage: JSONObject | undefined) {
  const tokens = usage?.tokens;

  if (
    tokens == null ||
    Array.isArray(tokens) ||
    typeof tokens !== 'object' ||
    typeof tokens.input_tokens !== 'number' ||
    typeof tokens.output_tokens !== 'number'
  ) {
    throw new Error('Cohere usage did not contain numeric token counts');
  }

  return {
    inputTokens: tokens.input_tokens,
    outputTokens: tokens.output_tokens,
  };
}

async function main() {
  const captured: CapturedUsage = {};
  const provider = createCohere({
    fetch: async (input, init) => {
      const response = await fetch(input, init);
      const clone = response.clone();
      const contentType = clone.headers.get('content-type') ?? '';

      if (response.ok && contentType.includes('text/event-stream')) {
        captured.stream = extractStreamingUsage(await clone.text());
      } else if (response.ok && contentType.includes('application/json')) {
        const body = (await clone.json()) as { usage?: JSONObject };
        captured.json = body.usage;
      }

      return response;
    },
  });
  const model = provider('command-a-03-2025');
  const prompt = 'Reply with exactly OK.';

  const generated = await generateText({
    model,
    prompt,
    maxOutputTokens: 5,
  });

  const streamed = streamText({
    model,
    prompt,
    maxOutputTokens: 5,
  });
  await streamed.consumeStream();
  const streamedUsage = await streamed.usage;

  const failures: string[] = [];
  const generatedCounts = getTokenCounts(captured.json);
  const streamedCounts = getTokenCounts(captured.stream);

  if (!isDeepStrictEqual(generated.usage.raw, captured.json)) {
    failures.push('generateText usage.raw did not preserve JSON usage');
  }

  if (!isDeepStrictEqual(streamedUsage.raw, captured.stream)) {
    failures.push('streamText usage.raw did not preserve message-end usage');
  }

  if (
    generated.usage.inputTokens !== generatedCounts.inputTokens ||
    generated.usage.outputTokens !== generatedCounts.outputTokens
  ) {
    failures.push('generateText normalized counts did not use usage.tokens');
  }

  if (
    streamedUsage.inputTokens !== streamedCounts.inputTokens ||
    streamedUsage.outputTokens !== streamedCounts.outputTokens
  ) {
    failures.push('streamText normalized counts did not use usage.tokens');
  }

  if (failures.length > 0) {
    console.error(`ISSUE_19736_RAW_USAGE_MISMATCH: ${failures.join('; ')}`);
    process.exitCode = 1;
    return;
  }

  console.log('Cohere raw usage was preserved for JSON and SSE responses.');
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
