import { createOpenResponses } from '@ai-sdk/open-responses';
import { streamText, tool } from 'ai';
import fs from 'node:fs';
import { z } from 'zod/v4';

function createSseFetch(fixtureName: string): typeof fetch {
  return async () =>
    new Response(
      [
        ...fs
          .readFileSync(
            `../../packages/open-responses/src/responses/__fixtures__/${fixtureName}.chunks.txt`,
            'utf8',
          )
          .trim()
          .split('\n')
          .map(event => `data: ${event}\n\n`),
        'data: [DONE]\n\n',
      ].join(''),
      {
        headers: {
          'content-type': 'text/event-stream',
        },
      },
    );
}

async function reproduceMismatchedReasoningEnd() {
  const openResponses = createOpenResponses({
    name: 'issue-18872-reasoning',
    url: 'https://example.test/v1/responses',
    fetch: createSseFetch('issue-18872-truncated-reasoning'),
  });

  const result = streamText({
    model: openResponses('reasoning-model'),
    prompt: 'Think until the output token limit is reached.',
  });

  const errors: unknown[] = [];

  for await (const part of result.fullStream) {
    if (part.type === 'error') {
      errors.push(part.error);
    }
  }

  return {
    errors,
    finishReason: await result.finishReason,
  };
}

async function reproduceUnknownIncompleteReason() {
  const openResponses = createOpenResponses({
    name: 'issue-18872-finish-reason',
    url: 'https://example.test/v1/responses',
    fetch: createSseFetch('issue-18872-unknown-incomplete-reason'),
  });

  const result = streamText({
    model: openResponses('tool-model'),
    prompt: 'Check the weather.',
    tools: {
      get_weather: tool({
        inputSchema: z.object({ location: z.string() }),
        execute: async ({ location }) => ({ location, temperature: 20 }),
      }),
    },
  });

  for await (const _part of result.fullStream) {
    // Consume the stream so the terminal finish reason is available.
  }

  return {
    finishReason: await result.finishReason,
    rawFinishReason: await result.rawFinishReason,
  };
}

async function main() {
  const reasoning = await reproduceMismatchedReasoningEnd();
  const unknownReason = await reproduceUnknownIncompleteReason();
  const failures: string[] = [];

  if (reasoning.errors.length > 0) {
    failures.push(
      `truncated reasoning emitted stream errors: ${reasoning.errors.map(String).join(', ')}`,
    );
  }

  if (reasoning.finishReason !== 'length') {
    failures.push(
      `max_output_tokens mapped to ${JSON.stringify(reasoning.finishReason)} instead of "length"`,
    );
  }

  if (unknownReason.finishReason !== 'other') {
    failures.push(
      `unknown incomplete reason ${JSON.stringify(unknownReason.rawFinishReason)} mapped to ${JSON.stringify(unknownReason.finishReason)} instead of "other"`,
    );
  }

  if (failures.length > 0) {
    console.error(
      `ISSUE #18872: Open Responses truncated-stream handling is incorrect\n${failures.map(failure => `- ${failure}`).join('\n')}`,
    );
    process.exitCode = 1;
    return;
  }

  console.log('Issue #18872 is not reproduced.');
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
