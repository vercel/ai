import { HarnessAgent } from '@ai-sdk/harness/agent';
import { createPi } from '@ai-sdk/harness-pi';
import { createJustBashSandbox } from '@ai-sdk/sandbox-just-bash';
import { tool } from 'ai';
import { realpath } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { InMemoryFs } from 'just-bash';
import { z } from 'zod/v4';

const EXPECTED_MAX_MODEL_RESULT_CHARS = 64 * 1024;
const TRUNCATION_NOTICE = /truncat|showing|full output|use offset|limit/i;

type FauxContext = {
  messages: Array<{
    role: string;
    content: Array<{ text?: string }>;
  }>;
};

async function loadFauxProvider() {
  const codingAgentDirectory = await realpath(
    fileURLToPath(
      new URL(
        '../../../../packages/harness-pi/node_modules/@earendil-works/pi-coding-agent',
        import.meta.url,
      ),
    ),
  );

  return import(
    pathToFileURL(
      path.join(
        path.dirname(codingAgentDirectory),
        'pi-ai/dist/providers/faux.js',
      ),
    ).href
  );
}

async function main() {
  const { createFauxCore, fauxAssistantMessage, fauxToolCall } =
    await loadFauxProvider();

  const faux = createFauxCore({
    provider: 'faux',
    api: 'openai-completions',
    models: [{ id: 'fake' }],
  });

  const call = (name: string, input: unknown) =>
    fauxAssistantMessage([fauxToolCall(name, input)], {
      stopReason: 'toolUse',
    });

  const measure = (context: FauxContext) => {
    let result: FauxContext['messages'][number] | undefined;
    for (let index = context.messages.length - 1; index >= 0; index--) {
      if (context.messages[index].role === 'toolResult') {
        result = context.messages[index];
        break;
      }
    }
    const text = result?.content.map(part => part.text ?? '').join('') ?? '';
    return fauxAssistantMessage(
      JSON.stringify({
        chars: text.length,
        hasTruncationNotice: TRUNCATION_NOTICE.test(text),
      }),
    );
  };

  const html = Array.from(
    { length: 20_000 },
    (_, index) => `<div>line ${index} ${'x'.repeat(40)}</div>`,
  ).join('\n');
  const minifiedHtml = `<main>${'z'.repeat(1_000_000)}</main>`;
  const longDirectoryEntries = Object.fromEntries(
    Array.from({ length: 400 }, (_, index) => [
      `/workspace/entry-${String(index).padStart(3, '0')}-${'n'.repeat(180)}.txt`,
      '',
    ]),
  );

  const agent = new HarnessAgent({
    harness: createPi({
      providers: {
        faux: {
          name: 'faux',
          baseUrl: 'http://faux.invalid',
          apiKey: 'none',
          api: 'openai-completions',
          streamSimple: faux.streamSimple,
          models: [
            {
              id: 'fake',
              name: 'fake',
              reasoning: false,
              input: ['text'],
              cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
              contextWindow: 10_000_000,
              maxTokens: 4096,
            },
          ],
        },
      },
    }),
    model: 'faux/fake',
    tools: {
      dump: tool({
        inputSchema: z.object({}),
        execute: async () => 'y'.repeat(1_000_000),
      }),
    },
    sandbox: createJustBashSandbox({
      cwd: '/',
      fs: new InMemoryFs({
        '/workspace/page.html': html,
        '/workspace/minified.html': minifiedHtml,
        ...longDirectoryEntries,
      }),
    }),
    sandboxConfig: { workDir: 'workspace' },
  });

  const scenarios = [
    { label: 'read', tool: 'read', input: { file_path: 'page.html' } },
    {
      label: 'read-page',
      tool: 'read',
      input: { file_path: 'page.html', offset: 2001, limit: 10 },
    },
    { label: 'bash', tool: 'bash', input: { command: 'cat page.html' } },
    {
      label: 'grep',
      tool: 'grep',
      input: { pattern: 'z', path: 'minified.html', limit: 1 },
    },
    {
      label: 'find',
      tool: 'find',
      input: { pattern: 'entry-*.txt', path: '.' },
    },
    { label: 'ls', tool: 'ls', input: { path: '.' } },
    { label: 'host', tool: 'dump', input: {} },
  ] as const;

  const session = await agent.createSession();
  const observations: Array<{
    label: string;
    chars: number;
    hasTruncationNotice: boolean;
  }> = [];

  try {
    console.log(`page.html is ${Buffer.byteLength(html)} bytes`);
    console.log(
      `minified.html is ${Buffer.byteLength(minifiedHtml)} bytes on one line`,
    );

    for (const scenario of scenarios) {
      faux.appendResponses([call(scenario.tool, scenario.input), measure]);
      const result = await agent.stream({
        session,
        prompt: scenario.label,
      });
      let text = '';
      for await (const part of result.stream) {
        if (part.type === 'text-delta') {
          const delta = part as { text?: string; delta?: string };
          text += delta.text ?? delta.delta ?? '';
        }
      }

      const observation = JSON.parse(text) as {
        chars: number;
        hasTruncationNotice: boolean;
      };
      observations.push({ label: scenario.label, ...observation });
      console.log(
        `${scenario.label.padEnd(9)} result reaching model: ${observation.chars} chars; truncation notice: ${observation.hasTruncationNotice}`,
      );
    }
  } finally {
    await session.destroy();
  }

  const oversized = observations.filter(
    observation => observation.chars > EXPECTED_MAX_MODEL_RESULT_CHARS,
  );
  if (oversized.length > 0) {
    console.error(
      `ISSUE #21454 REPRODUCED: oversized tool results reached the model untruncated (${oversized.map(result => `${result.label}=${result.chars}`).join(', ')})`,
    );
    process.exitCode = 1;
    return;
  }

  const missingNotices = observations.filter(
    observation => !observation.hasTruncationNotice,
  );
  if (missingNotices.length > 0) {
    console.error(
      `Issue #21454 remains: bounded tool results lacked a truncation or continuation notice (${missingNotices.map(result => result.label).join(', ')})`,
    );
    process.exitCode = 1;
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
