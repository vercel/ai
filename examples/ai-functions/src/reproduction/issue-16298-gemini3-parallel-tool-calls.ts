import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import type {
  LanguageModelV4Prompt,
  SharedV4ProviderMetadata,
  SharedV4Warning,
} from '@ai-sdk/provider';
import type { GatewayProviderOptions } from '@ai-sdk/gateway';
import { createGateway, stepCountIs, streamText, tool } from 'ai';
import { z } from 'zod';
import {
  convertToGoogleMessages,
  SKIP_THOUGHT_SIGNATURE_VALIDATOR,
} from '../../../../packages/google/src/convert-to-google-messages';

const failureSignal =
  'Issue #16298 reproduced: valid parallel Gemini 3 tool calls triggered the skip_thought_signature_validator warning.';

type Fixture = {
  model: string;
  prompt: string;
  warnings: SharedV4Warning[];
  toolCalls: Array<{
    stepIndex: number;
    toolCallId: string;
    toolName: string;
    input: unknown;
    providerMetadata: SharedV4ProviderMetadata | null;
  }>;
};

function readThoughtSignature(
  providerMetadata: Fixture['toolCalls'][number]['providerMetadata'],
): string | undefined {
  for (const namespace of ['google', 'vertex', 'googleVertex']) {
    const thoughtSignature = providerMetadata?.[namespace]?.thoughtSignature;
    if (typeof thoughtSignature === 'string') {
      return thoughtSignature;
    }
  }
}

async function runLive() {
  const gateway = createGateway({ apiKey: process.env.AI_GATEWAY_API_KEY! });
  const prompt =
    'Use get_weather for Paris and Tokyo in parallel in one assistant step, then summarize both weather results.';

  const result = streamText({
    model: gateway('google/gemini-3.1-flash-lite'),
    abortSignal: AbortSignal.timeout(60_000),
    stopWhen: stepCountIs(3),
    providerOptions: {
      gateway: {
        order: ['vertex'],
        only: ['vertex'],
      } satisfies GatewayProviderOptions,
    },
    tools: {
      get_weather: tool({
        description: 'Get the current weather for a city.',
        inputSchema: z.object({ city: z.string() }),
        execute: async ({ city }) => ({
          city,
          tempC: city === 'Tokyo' ? 24 : 21,
          conditions: 'sunny',
        }),
      }),
    },
    prompt,
  });

  for await (const _ of result.textStream) {
    // Drain all steps so the replay warning is available.
  }

  const fixture: Fixture = {
    model: 'google/gemini-3.1-flash-lite',
    prompt,
    warnings: (await result.warnings) ?? [],
    toolCalls: (await result.steps).flatMap((step, stepIndex) =>
      step.content
        .filter(part => part.type === 'tool-call')
        .map(part => ({
          stepIndex,
          toolCallId: part.toolCallId,
          toolName: part.toolName,
          input: part.input,
          providerMetadata:
            (part.providerMetadata as Fixture['toolCalls'][number]['providerMetadata']) ??
            null,
        })),
    ),
  };

  console.log(JSON.stringify(fixture, null, 2));

  const hasSignedCall = fixture.toolCalls.some(
    call => readThoughtSignature(call.providerMetadata) != null,
  );
  const hasUnsignedCall = fixture.toolCalls.some(
    call => readThoughtSignature(call.providerMetadata) == null,
  );
  const hasWarning = fixture.warnings.some(
    warning =>
      warning.type === 'other' &&
      warning.message.includes(SKIP_THOUGHT_SIGNATURE_VALIDATOR),
  );

  if (hasSignedCall && hasUnsignedCall && hasWarning) {
    throw new Error(failureSignal);
  }
}

async function replayFixture() {
  const fixturePath = fileURLToPath(
    new URL(
      '../../../../packages/google/src/__fixtures__/issue-16298-gemini3-parallel-tool-calls.json',
      import.meta.url,
    ),
  );
  const fixture = JSON.parse(await readFile(fixturePath, 'utf8')) as Fixture;
  const warnings: SharedV4Warning[] = [];

  const prompt: LanguageModelV4Prompt = [
    {
      role: 'user',
      content: [{ type: 'text', text: fixture.prompt }],
    },
    {
      role: 'assistant',
      content: fixture.toolCalls.map(call => ({
        type: 'tool-call' as const,
        toolCallId: call.toolCallId,
        toolName: call.toolName,
        input: call.input,
        providerOptions: call.providerMetadata ?? undefined,
      })),
    },
  ];

  const converted = convertToGoogleMessages(prompt, {
    isGemini3Model: true,
    providerOptionsNames: ['googleVertex', 'vertex'],
    onWarning: warning => warnings.push(warning),
  });

  console.log(
    JSON.stringify(
      {
        recordedWarnings: fixture.warnings,
        replayWarnings: warnings,
        convertedToolCallParts: converted.contents[1].parts,
      },
      null,
      2,
    ),
  );

  const hasWarning = warnings.some(
    warning =>
      warning.type === 'other' &&
      warning.message.includes(SKIP_THOUGHT_SIGNATURE_VALIDATOR),
  );
  const hasInjectedSentinel = converted.contents[1].parts.some(
    part =>
      'thoughtSignature' in part &&
      part.thoughtSignature === SKIP_THOUGHT_SIGNATURE_VALIDATOR,
  );

  if (hasWarning && hasInjectedSentinel) {
    throw new Error(failureSignal);
  }
}

async function main() {
  if (process.env.LIVE_PROVIDER === '1') {
    await runLive();
  } else {
    await replayFixture();
  }
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
