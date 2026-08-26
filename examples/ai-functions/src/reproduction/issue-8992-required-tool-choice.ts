import type { LanguageModelV3GenerateResult } from '@ai-sdk/provider';
import { readFileSync } from 'node:fs';
import { generateText, tool } from 'ai';
import { MockLanguageModelV3 } from 'ai/test';
import { z } from 'zod';

type RecordedFixture = {
  request: {
    toolChoice: {
      type: string;
    };
  };
  response: LanguageModelV3GenerateResult;
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
  response: LanguageModelV3GenerateResult,
) {
  let observedToolChoice: unknown;
  let providerReturned = false;
  let stopWhenCalls = 0;
  let repairToolCallCalls = 0;

  try {
    const result = await generateText({
      model: new MockLanguageModelV3({
        provider: 'gateway',
        modelId: 'openai/gpt-oss-20b',
        doGenerate: async options => {
          observedToolChoice = options.toolChoice;
          providerReturned = true;
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
      experimental_repairToolCall: async () => {
        repairToolCallCalls++;
        return null;
      },
    });

    return {
      kind: 'returned' as const,
      result,
      observedToolChoice,
      stopWhenCalls,
      repairToolCallCalls,
    };
  } catch (error) {
    if (!providerReturned) {
      throw error;
    }

    return {
      kind: 'rejected' as const,
      error: error instanceof Error ? error.message : String(error),
      observedToolChoice,
      stopWhenCalls,
      repairToolCallCalls,
    };
  }
}

async function main() {
  const recordedResponseReplay = await generateWithRequiredTool({
    ...fixture.response,
    usage: {
      ...fixture.response.usage,
      inputTokens: {
        ...fixture.response.usage.inputTokens,
        cacheWrite: fixture.response.usage.inputTokens.cacheWrite,
      },
    },
  });

  const serializedToolCallReplay = await generateWithRequiredTool({
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
    recordedResponseReplay:
      recordedResponseReplay.kind === 'returned'
        ? {
            kind: recordedResponseReplay.kind,
            forwardedToolChoice: recordedResponseReplay.observedToolChoice,
            text: recordedResponseReplay.result.text,
            reasoningText: recordedResponseReplay.result.reasoningText,
            toolCallCount: recordedResponseReplay.result.toolCalls.length,
            finishReason: recordedResponseReplay.result.finishReason,
            stopWhenCalls: recordedResponseReplay.stopWhenCalls,
            repairToolCallCalls: recordedResponseReplay.repairToolCallCalls,
          }
        : recordedResponseReplay,
    serializedToolCallReplay:
      serializedToolCallReplay.kind === 'returned'
        ? {
            kind: serializedToolCallReplay.kind,
            text: serializedToolCallReplay.result.text,
            toolCallCount: serializedToolCallReplay.result.toolCalls.length,
            stopWhenCalls: serializedToolCallReplay.stopWhenCalls,
            repairToolCallCalls: serializedToolCallReplay.repairToolCallCalls,
          }
        : serializedToolCallReplay,
  };

  console.log(JSON.stringify(observed, null, 2));

  const returnedWithoutRequiredTool =
    fixture.request.toolChoice.type === 'required' &&
    recordedResponseReplay.kind === 'returned' &&
    (recordedResponseReplay.result.text.length > 0 ||
      recordedResponseReplay.result.reasoning.length > 0) &&
    recordedResponseReplay.result.toolCalls.length === 0;

  if (returnedWithoutRequiredTool) {
    throw new Error(
      'Reproduced issue #8992: generateText returned text/reasoning with zero tool calls even though toolChoice was required.',
    );
  }

  console.log(
    'Issue #8992 is not reproduced: generateText enforced the required tool choice.',
  );
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
