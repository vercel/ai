import type { LanguageModelV4GenerateResult } from '@ai-sdk/provider';
import { readFileSync } from 'node:fs';
import { generateText, tool } from 'ai';
import { MockLanguageModelV4 } from 'ai/test';
import { z } from 'zod';

type RecordedFixture = {
  request: {
    toolChoice: {
      type: string;
    };
  };
  response: LanguageModelV4GenerateResult;
};

const fixture = JSON.parse(
  readFileSync(
    new URL(
      '../../../../packages/gateway/src/__fixtures__/issue-8992-deepinfra-required-tool-choice.json',
      import.meta.url,
    ),
    'utf8',
  ),
) as RecordedFixture;

async function generateWithRequiredTool(
  response: LanguageModelV4GenerateResult,
) {
  let observedToolChoice: unknown;
  let stopWhenCalls = 0;
  let repairToolCallCalls = 0;

  const result = await generateText({
    model: new MockLanguageModelV4({
      provider: 'gateway',
      modelId: 'openai/gpt-oss-20b',
      doGenerate: async options => {
        observedToolChoice = options.toolChoice;
        return response;
      },
    }),
    prompt:
      'Do not call any tool. Reply only with the exact plain text NO_TOOL.',
    tools: {
      requiredAction: tool({
        description: 'The required action. Always call this tool.',
        inputSchema: z.object({ value: z.string() }),
        execute: async input => input,
      }),
    },
    toolChoice: 'required',
    stopWhen: () => {
      stopWhenCalls++;
      return false;
    },
    repairToolCall: async () => {
      repairToolCallCalls++;
      return null;
    },
  });

  return {
    result,
    observedToolChoice,
    stopWhenCalls,
    repairToolCallCalls,
  };
}

async function main() {
  const liveFixtureReplay = await generateWithRequiredTool(fixture.response);

  const unparsedToolCallReplay = await generateWithRequiredTool({
    content: [
      {
        type: 'text',
        text: JSON.stringify({
          type: 'tool-call',
          toolName: 'requiredAction',
          input: { value: 'from-text' },
        }),
      },
    ],
    finishReason: {
      unified: 'stop',
      raw: 'stop',
    },
    usage: {
      inputTokens: {
        total: 1,
        noCache: 1,
        cacheRead: 0,
        cacheWrite: 0,
      },
      outputTokens: {
        total: 1,
        text: 1,
        reasoning: 0,
      },
    },
    warnings: [],
  });

  const observed = {
    recordedRequestToolChoice: fixture.request.toolChoice,
    forwardedToolChoice: liveFixtureReplay.observedToolChoice,
    liveFixtureReplay: {
      text: liveFixtureReplay.result.text,
      reasoning: liveFixtureReplay.result.reasoning,
      toolCallCount: liveFixtureReplay.result.toolCalls.length,
      finishReason: liveFixtureReplay.result.finishReason,
      stopWhenCalls: liveFixtureReplay.stopWhenCalls,
      repairToolCallCalls: liveFixtureReplay.repairToolCallCalls,
    },
    unparsedToolCallReplay: {
      text: unparsedToolCallReplay.result.text,
      toolCallCount: unparsedToolCallReplay.result.toolCalls.length,
      stopWhenCalls: unparsedToolCallReplay.stopWhenCalls,
      repairToolCallCalls: unparsedToolCallReplay.repairToolCallCalls,
    },
  };

  console.log(JSON.stringify(observed, null, 2));

  const reproduced =
    fixture.request.toolChoice.type === 'required' &&
    (liveFixtureReplay.result.text.length > 0 ||
      liveFixtureReplay.result.reasoning.length > 0) &&
    liveFixtureReplay.result.toolCalls.length === 0 &&
    liveFixtureReplay.stopWhenCalls === 0 &&
    liveFixtureReplay.repairToolCallCalls === 0 &&
    unparsedToolCallReplay.result.text.includes('"type":"tool-call"') &&
    unparsedToolCallReplay.result.toolCalls.length === 0 &&
    unparsedToolCallReplay.repairToolCallCalls === 0;

  if (reproduced) {
    throw new Error(
      'Reproduced issue #8992: generateText returned text/reasoning with zero tool calls even though toolChoice was required.',
    );
  }

  throw new Error(
    'Issue #8992 was not reproduced: generateText did not return the reported result.',
  );
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
