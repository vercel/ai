import {
  createAnthropic,
  type AnthropicLanguageModelOptions,
} from '@ai-sdk/anthropic';
import { streamText } from 'ai';
import fs from 'node:fs/promises';

type CapturedCall = {
  requestBody: Record<string, unknown>;
  responseBody: string;
};

type Scenario = {
  requestBody: Record<string, unknown>;
  reasoningDeltaCount: number;
  reasoningTextLength: number;
  text: string;
  usage: unknown;
  warnings: unknown;
};

const prompt =
  'Find the greatest common divisor of 1071 and 462 using the Euclidean algorithm. Think through every division step before answering.';

function parseRequestBody(body: BodyInit | null | undefined) {
  if (typeof body !== 'string') {
    throw new Error('Expected the Anthropic request body to be a JSON string.');
  }

  return JSON.parse(body) as Record<string, unknown>;
}

function extractChunkFixture(responseBody: string) {
  return responseBody
    .split('\n')
    .filter(line => line.startsWith('data: '))
    .map(line => line.slice('data: '.length))
    .filter(line => line !== '[DONE]')
    .join('\n');
}

async function runScenario({
  model = 'claude-sonnet-5',
  providerOptions,
}: {
  model?: 'claude-sonnet-5' | 'claude-sonnet-4-5';
  providerOptions?: {
    anthropic: {
      thinking: {
        type: 'adaptive';
        display: 'summarized';
      };
    };
  };
}): Promise<{ scenario: Scenario; capturedCall: CapturedCall }> {
  let capturedCall: CapturedCall | undefined;

  const provider = createAnthropic({
    fetch: async (input, init) => {
      const response = await fetch(input, init);
      capturedCall = {
        requestBody: parseRequestBody(init?.body),
        responseBody: await response.clone().text(),
      };
      return response;
    },
  });

  const result = streamText({
    model: provider(model),
    reasoning: 'high',
    prompt,
    maxOutputTokens: 2000,
    maxRetries: 0,
    providerOptions,
  });

  let reasoningDeltaCount = 0;
  let reasoningText = '';
  let text = '';

  for await (const part of result.fullStream) {
    if (part.type === 'reasoning-delta') {
      reasoningDeltaCount++;
      reasoningText += part.text;
    } else if (part.type === 'text-delta') {
      text += part.text;
    }
  }

  if (capturedCall == null) {
    throw new Error('The Anthropic request was not captured.');
  }

  return {
    scenario: {
      requestBody: capturedCall.requestBody,
      reasoningDeltaCount,
      reasoningTextLength: reasoningText.length,
      text,
      usage: await result.usage,
      warnings: await result.warnings,
    },
    capturedCall,
  };
}

async function main() {
  const generic = await runScenario({});
  const legacy = await runScenario({ model: 'claude-sonnet-4-5' });
  const summarized = await runScenario({
    providerOptions: {
      anthropic: {
        thinking: { type: 'adaptive', display: 'summarized' },
      } satisfies AnthropicLanguageModelOptions,
    },
  });

  if (process.env.CAPTURE_ISSUE_18238 === '1') {
    await fs.writeFile(
      '../../packages/anthropic/src/__fixtures__/anthropic-claude-sonnet-5-reasoning-generic.chunks.txt',
      extractChunkFixture(generic.capturedCall.responseBody),
    );
    await fs.writeFile(
      '../../packages/anthropic/src/__fixtures__/anthropic-claude-sonnet-5-reasoning-summarized.chunks.txt',
      extractChunkFixture(summarized.capturedCall.responseBody),
    );
  }

  console.log(
    JSON.stringify(
      {
        expected:
          'The provider-agnostic reasoning option should stream visible reasoning text on Claude Sonnet 5.',
        generic: generic.scenario,
        legacyClaudeSonnet45: legacy.scenario,
        explicitSummarizedDisplay: summarized.scenario,
      },
      null,
      2,
    ),
  );

  if (
    generic.scenario.reasoningTextLength === 0 &&
    summarized.scenario.reasoningTextLength > 0
  ) {
    throw new Error(
      'Reproduced issue #18238: generic reasoning streamed zero visible reasoning text while explicit summarized display streamed reasoning text.',
    );
  }

  if (generic.scenario.reasoningTextLength === 0) {
    throw new Error(
      'Generic reasoning streamed zero visible reasoning text, but the explicit summarized-display comparison did not produce reasoning text.',
    );
  }
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
