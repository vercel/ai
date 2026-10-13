import { createCerebras } from '@ai-sdk/cerebras';
import { spawnSync } from 'node:child_process';
import { rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const issueSignal =
  'Reproduced issue #19216: @ai-sdk/cerebras does not publicly expose typed options for request fields that it forwards at runtime.';

const reportedProviderOptions = {
  max_completion_tokens: 64,
  parallel_tool_calls: false,
  logprobs: true,
  top_logprobs: 2,
  logit_bias: { '42': 1 },
  service_tier: 'priority',
  reasoningEffort: 'none',
  reasoning_format: 'parsed',
  prediction: { type: 'content', content: 'expected' },
  prompt_cache_key: 'cache-key',
} as const;

async function verifyRuntimeForwarding() {
  let requestBody: Record<string, unknown> | undefined;
  const cerebras = createCerebras({
    apiKey: 'test-api-key',
    fetch: async (_input, init) => {
      requestBody = JSON.parse(String(init?.body));

      return new Response(
        JSON.stringify({
          id: 'chatcmpl-test',
          created: 0,
          model: 'gpt-oss-120b',
          choices: [
            {
              index: 0,
              message: { role: 'assistant', content: 'ok' },
              finish_reason: 'stop',
            },
          ],
          usage: {
            prompt_tokens: 1,
            completion_tokens: 1,
            total_tokens: 2,
          },
        }),
        { headers: { 'content-type': 'application/json' } },
      );
    },
  });

  await cerebras('gpt-oss-120b').doGenerate({
    prompt: [{ role: 'user', content: [{ type: 'text', text: 'Hello' }] }],
    providerOptions: { cerebras: reportedProviderOptions },
  });

  const expectedForwardedOptions = {
    max_completion_tokens: 64,
    parallel_tool_calls: false,
    logprobs: true,
    top_logprobs: 2,
    logit_bias: { '42': 1 },
    service_tier: 'priority',
    reasoning_effort: 'none',
    reasoning_format: 'parsed',
    prediction: { type: 'content', content: 'expected' },
    prompt_cache_key: 'cache-key',
  };

  for (const [key, expected] of Object.entries(expectedForwardedOptions)) {
    if (JSON.stringify(requestBody?.[key]) !== JSON.stringify(expected)) {
      throw new Error(
        `Runtime precondition failed: expected Cerebras request field ${key} to be forwarded.`,
      );
    }
  }
}

function verifyPublicTypes() {
  const fixturePath = join(
    dirname(fileURLToPath(import.meta.url)),
    '.issue-19216-types.ts',
  );

  writeFileSync(
    fixturePath,
    `
import type { CerebrasLanguageModelChatOptions } from '../../../../packages/cerebras/src/index';

type Equal<Left, Right> =
  (<Value>() => Value extends Left ? 1 : 2) extends
  (<Value>() => Value extends Right ? 1 : 2)
    ? true
    : false;
type Assert<Value extends true> = Value;

const options: CerebrasLanguageModelChatOptions = {
  user: 'user-123',
  textVerbosity: 'medium',
  strictJsonSchema: true,
  max_completion_tokens: 64,
  parallel_tool_calls: false,
  logprobs: true,
  top_logprobs: 2,
  logit_bias: { '42': 1 },
  service_tier: 'priority',
  reasoningEffort: 'none',
  reasoning_format: 'parsed',
  prediction: { type: 'content', content: 'expected' },
  prompt_cache_key: 'cache-key',
};

type ServiceTierIsExact = Assert<
  Equal<
    NonNullable<CerebrasLanguageModelChatOptions['service_tier']>,
    'auto' | 'default' | 'flex' | 'priority'
  >
>;
type ReasoningEffortIsExact = Assert<
  Equal<
    NonNullable<CerebrasLanguageModelChatOptions['reasoningEffort']>,
    'none' | 'low' | 'medium' | 'high'
  >
>;
type ReasoningFormatIsExact = Assert<
  Equal<
    NonNullable<CerebrasLanguageModelChatOptions['reasoning_format']>,
    'none' | 'parsed' | 'text_parsed' | 'raw' | 'hidden'
  >
>;

void options;
const typeAssertions: [
  ServiceTierIsExact,
  ReasoningEffortIsExact,
  ReasoningFormatIsExact,
] = [true, true, true];
void typeAssertions;
`,
  );

  try {
    const result = spawnSync(
      process.execPath,
      [
        require.resolve('typescript/bin/tsc'),
        '--noEmit',
        '--strict',
        '--skipLibCheck',
        '--target',
        'ES2022',
        '--module',
        'ESNext',
        '--moduleResolution',
        'Bundler',
        '--types',
        'node',
        fixturePath,
      ],
      { encoding: 'utf8' },
    );

    if (result.error != null) {
      throw result.error;
    }

    if (result.status === 0) {
      return;
    }

    const diagnostics = `${result.stdout}${result.stderr}`;
    if (
      diagnostics.includes(
        "has no exported member 'CerebrasLanguageModelChatOptions'",
      ) ||
      diagnostics.includes("Type 'string' is not assignable to type 'never'") ||
      diagnostics.includes(
        "Property 'max_completion_tokens' does not exist on type",
      )
    ) {
      throw new Error(issueSignal);
    }

    throw new Error(`Unexpected TypeScript diagnostics:\n${diagnostics}`);
  } finally {
    rmSync(fixturePath, { force: true });
  }
}

async function main() {
  await verifyRuntimeForwarding();
  verifyPublicTypes();
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
