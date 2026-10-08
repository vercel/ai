import { createAmazonBedrock } from '@ai-sdk/amazon-bedrock';
import { createAnthropic } from '@ai-sdk/anthropic';
import assert from 'node:assert/strict';
import { generateText, tool } from 'ai';
import { z } from 'zod';

type Warning = {
  type: string;
  feature?: string;
  details?: string;
};

type ProviderRun = {
  warnings: Warning[];
  loggedWarnings: Warning[];
  requestTools: Array<Record<string, unknown>>;
};

const anthropicResponse = {
  id: 'msg_reproduction',
  type: 'message',
  role: 'assistant',
  model: 'kimi-k3',
  content: [{ type: 'text', text: 'ok' }],
  stop_reason: 'end_turn',
  stop_sequence: null,
  usage: { input_tokens: 1, output_tokens: 1 },
};

const bedrockResponse = {
  output: {
    message: {
      role: 'assistant',
      content: [{ text: 'ok' }],
    },
  },
  stopReason: 'end_turn',
  usage: {
    inputTokens: 1,
    outputTokens: 1,
    totalTokens: 2,
  },
};

function createTools(strict: boolean, count: number) {
  return Object.fromEntries(
    Array.from({ length: count }, (_, index) => {
      const name = index === 0 ? 'refresh_repo' : `refresh_repo_${index + 1}`;
      return [
        name,
        tool({
          description: 'Refresh a repository.',
          inputSchema: z.object({}),
          strict,
        }),
      ];
    }),
  );
}

function strictWarnings(warnings: Warning[], strict: boolean) {
  return warnings.filter(
    warning =>
      warning.type === 'unsupported' &&
      warning.feature === 'strict' &&
      warning.details?.includes(`strict: ${strict}`),
  );
}

async function runAnthropic(strict: boolean, toolCount: number) {
  let requestBody: any;
  const loggedWarnings: Warning[] = [];
  globalThis.AI_SDK_LOG_WARNINGS = ({ warnings }) => {
    loggedWarnings.push(...warnings);
  };

  const anthropic = createAnthropic({
    apiKey: 'test-api-key',
    baseURL: 'https://anthropic-compatible.example/v1',
    fetch: async (_input, init) => {
      requestBody = JSON.parse(String(init?.body));
      return new Response(JSON.stringify(anthropicResponse), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    },
  });

  const result = await generateText({
    model: anthropic('kimi-k3'),
    prompt: 'hi',
    maxOutputTokens: 16,
    tools: createTools(strict, toolCount),
  });

  assert.ok(requestBody, 'Anthropic request was not captured');
  return {
    warnings: result.warnings ?? [],
    loggedWarnings,
    requestTools: requestBody.tools,
  } satisfies ProviderRun;
}

async function runBedrock(strict: boolean, toolCount: number) {
  let requestBody: any;
  const loggedWarnings: Warning[] = [];
  globalThis.AI_SDK_LOG_WARNINGS = ({ warnings }) => {
    loggedWarnings.push(...warnings);
  };

  const bedrock = createAmazonBedrock({
    apiKey: 'test-api-key',
    region: 'us-east-1',
    fetch: async (_input, init) => {
      requestBody = JSON.parse(String(init?.body));
      return new Response(JSON.stringify(bedrockResponse), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    },
  });

  const result = await generateText({
    model: bedrock('anthropic.claude-opus-4-7'),
    prompt: 'hi',
    maxOutputTokens: 16,
    tools: createTools(strict, toolCount),
  });

  assert.ok(requestBody, 'Amazon Bedrock request was not captured');
  return {
    warnings: result.warnings ?? [],
    loggedWarnings,
    requestTools: requestBody.toolConfig.tools.map(
      (entry: { toolSpec: Record<string, unknown> }) => entry.toolSpec,
    ),
  } satisfies ProviderRun;
}

function assertPayloadOmitsStrict(run: ProviderRun, provider: string) {
  for (const requestTool of run.requestTools) {
    assert.ok(
      !Object.hasOwn(requestTool, 'strict'),
      `${provider} unexpectedly sent strict for an unsupported model`,
    );
  }
}

function assertStrictTrueControl(run: ProviderRun, provider: string) {
  assert.equal(
    strictWarnings(run.warnings, true).length,
    1,
    `${provider} must keep the unsupported warning for strict: true`,
  );
  assert.equal(
    strictWarnings(run.loggedWarnings, true).length,
    1,
    `${provider} must log the unsupported warning for strict: true`,
  );
  assertPayloadOmitsStrict(run, provider);
}

async function main() {
  const anthropicFalse = await runAnthropic(false, 2);
  const bedrockFalse = await runBedrock(false, 2);
  const anthropicTrue = await runAnthropic(true, 1);
  const bedrockTrue = await runBedrock(true, 1);

  assertPayloadOmitsStrict(anthropicFalse, 'anthropic.messages');
  assertPayloadOmitsStrict(bedrockFalse, 'amazon-bedrock');
  assertStrictTrueControl(anthropicTrue, 'anthropic.messages');
  assertStrictTrueControl(bedrockTrue, 'amazon-bedrock');

  const affectedProviders = (
    [
      ['anthropic.messages', anthropicFalse],
      ['amazon-bedrock', bedrockFalse],
    ] satisfies Array<[string, ProviderRun]>
  )
    .filter(([, run]) => strictWarnings(run.warnings, false).length > 0)
    .map(([provider, run]) => {
      assert.equal(
        strictWarnings(run.warnings, false).length,
        2,
        `${provider} should return one strict: false warning per tool`,
      );
      assert.equal(
        strictWarnings(run.loggedWarnings, false).length,
        2,
        `${provider} should log one strict: false warning per tool`,
      );
      return provider;
    });

  if (affectedProviders.length > 0) {
    console.error(
      `ISSUE_22291: strict: false emitted unsupported strict warnings for ${affectedProviders.join(', ')}`,
    );
    process.exitCode = 1;
    return;
  }

  console.log('Issue #22291 did not reproduce.');
}

main().catch(error => {
  console.error('REPRODUCTION_HARNESS_ERROR', error);
  process.exitCode = 2;
});
