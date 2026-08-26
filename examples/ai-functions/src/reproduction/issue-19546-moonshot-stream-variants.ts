import type { LanguageModelV3StreamPart } from '@ai-sdk/provider';
import { createMoonshotAI } from '@ai-sdk/moonshotai';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const fixtureDirectory = new URL(
  '../../../../packages/moonshotai/src/__fixtures__/',
  import.meta.url,
);

async function replayFixture(
  filename: string,
): Promise<LanguageModelV3StreamPart[]> {
  const fixture = fs
    .readFileSync(new URL(filename, fixtureDirectory), 'utf8')
    .trim()
    .split('\n')
    .map(line => `data: ${line}\n\n`)
    .join('');

  const provider = createMoonshotAI({
    apiKey: 'reproduction-key',
    fetch: async () =>
      new Response(`${fixture}data: [DONE]\n\n`, {
        status: 200,
        headers: { 'content-type': 'text/event-stream' },
      }),
  });

  const result = await provider.chatModel('kimi-k2.5').doStream({
    prompt: [
      {
        role: 'user',
        content: [{ type: 'text', text: 'Run the requested tools.' }],
      },
    ],
  });

  const parts: LanguageModelV3StreamPart[] = [];
  const reader = result.stream.getReader();
  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    parts.push(value);
  }
  return parts;
}

function toolCalls(parts: LanguageModelV3StreamPart[]) {
  return parts
    .filter(part => part.type === 'tool-call')
    .map(({ toolCallId, toolName, input }) => ({
      toolCallId,
      toolName,
      input,
    }));
}

function finish(parts: LanguageModelV3StreamPart[]) {
  const part = parts.find(part => part.type === 'finish');
  assert.ok(part != null, 'stream must emit a finish part');
  return part;
}

async function main() {
  const explicitIndexParts = await replayFixture(
    'moonshotai-issue-19546-explicit-index-live.chunks.txt',
  );
  assert.equal(
    explicitIndexParts.some(part => part.type === 'error'),
    false,
    'recorded explicit-index stream must remain valid',
  );
  assert.deepEqual(toolCalls(explicitIndexParts), [
    {
      toolCallId: 'weather_0',
      toolName: 'weather',
      input: '{"location": "San Francisco"}',
    },
  ]);

  const malformedParts = await replayFixture(
    'moonshotai-issue-19546-malformed.chunks.txt',
  );
  assert.equal(
    malformedParts.some(part => part.type === 'error'),
    true,
    'malformed tool-call indices must still surface validation errors',
  );

  const precedenceParts = await replayFixture(
    'moonshotai-issue-19546-usage-precedence.chunks.txt',
  );
  assert.equal(finish(precedenceParts).usage.inputTokens.total, 99);
  assert.equal(finish(precedenceParts).usage.outputTokens.total, 33);

  const defects: string[] = [];

  const indexlessParts = await replayFixture(
    'moonshotai-issue-19546-indexless-tool-calls.chunks.txt',
  );
  const indexlessWorked =
    !indexlessParts.some(part => part.type === 'error') &&
    JSON.stringify(toolCalls(indexlessParts)) ===
      JSON.stringify([
        {
          toolCallId: 'weather_0',
          toolName: 'weather',
          input: '{"location":"San Francisco"}',
        },
        {
          toolCallId: 'time_1',
          toolName: 'time',
          input: '{"zone":"UTC"}',
        },
      ]);
  if (!indexlessWorked) {
    defects.push('index-less tool-call chunks were rejected');
  }

  const choiceUsageParts = await replayFixture(
    'moonshotai-issue-19546-choice-usage-live.chunks.txt',
  );
  const choiceUsageFinish = finish(choiceUsageParts);
  if (
    choiceUsageFinish.usage.inputTokens.total !== 12 ||
    choiceUsageFinish.usage.outputTokens.total !== 5
  ) {
    defects.push('choice-level usage was lost');
  }

  if (defects.length > 0) {
    throw new Error(`ISSUE_19546_REPRODUCED: ${defects.join('; ')}`);
  }

  console.log(
    'Issue #19546 is fixed: documented Moonshot stream variants are accepted.',
  );
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
