import { createDeepSeek } from '@ai-sdk/deepseek';
import type { LanguageModelV4Prompt, SharedV4Warning } from '@ai-sdk/provider';
import fs from 'node:fs/promises';

const FAILURE_SIGNAL =
  'Issue #19381 reproduced: DeepSeek generate/stream requests emit undocumented thinking/reasoning values.';

const TEST_PROMPT: LanguageModelV4Prompt = [
  { role: 'user', content: [{ type: 'text', text: 'Reply with OK.' }] },
];

const fixtureDirectory = new URL(
  '../../../../packages/deepseek/src/chat/__fixtures__/',
  import.meta.url,
);

async function main() {
  const generateFixture = await fs.readFile(
    new URL('issue-19381-thinking-reasoning.json', fixtureDirectory),
    'utf8',
  );
  const streamFixture = await fs.readFile(
    new URL('issue-19381-thinking-reasoning.chunks.txt', fixtureDirectory),
    'utf8',
  );
  const requestBodies: Array<Record<string, unknown>> = [];

  const provider = createDeepSeek({
    apiKey: 'test-api-key',
    fetch: async (_input, init) => {
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      requestBodies.push(body);

      if (body.stream === true) {
        const streamBody = `${streamFixture
          .trim()
          .split('\n')
          .map(line => `data: ${line}\n\n`)
          .join('')}data: [DONE]\n\n`;
        return new Response(streamBody, {
          status: 200,
          headers: { 'content-type': 'text/event-stream' },
        });
      }

      return new Response(generateFixture, {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    },
  });

  const legacyAdaptiveOptions = {
    thinking: { type: 'adaptive' },
  } as const;

  const generateResult = await provider.chat('deepseek-v4-pro').doGenerate({
    prompt: TEST_PROMPT,
    reasoning: 'medium',
    providerOptions: {
      deepseek: legacyAdaptiveOptions,
    },
  });

  const streamResult = await provider.chat('deepseek-v4-pro').doStream({
    prompt: TEST_PROMPT,
    reasoning: 'medium',
    providerOptions: {
      deepseek: legacyAdaptiveOptions,
    },
  });
  const streamReader = streamResult.stream.getReader();
  let streamWarnings: SharedV4Warning[] = [];
  while (true) {
    const { done, value } = await streamReader.read();
    if (done) {
      break;
    }
    if (value.type === 'stream-start') {
      streamWarnings = value.warnings;
    }
  }

  const failures: string[] = [];
  for (const [operation, body] of [
    ['generate', requestBodies[0], generateResult.warnings],
    ['stream', requestBodies[1], streamWarnings],
  ] as const) {
    const thinking = body.thinking as { type?: string } | undefined;

    if (thinking?.type === 'adaptive') {
      failures.push(`${operation} emitted thinking.type="adaptive"`);
    }
    if (body.reasoning_effort !== 'high') {
      failures.push(
        `${operation} emitted reasoning_effort=${JSON.stringify(body.reasoning_effort)} instead of "high"`,
      );
    }
  }

  if (failures.length > 0) {
    console.error(FAILURE_SIGNAL);
    for (const failure of failures) {
      console.error(`- ${failure}`);
    }
    console.error(
      `- generate warnings: ${JSON.stringify(generateResult.warnings)}`,
    );
    console.error(`- stream warnings: ${JSON.stringify(streamWarnings)}`);
    process.exitCode = 1;
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
