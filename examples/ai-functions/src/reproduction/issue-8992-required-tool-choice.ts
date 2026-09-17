import type { LanguageModelV2 } from '@ai-sdk/provider';
import { readFileSync } from 'node:fs';
import { generateText, tool } from 'ai';
import { MockLanguageModelV2 } from 'ai/test';
import { z } from 'zod';

type V2GenerateResult = Awaited<ReturnType<LanguageModelV2['doGenerate']>>;

type RecordedFixture = {
  request: {
    toolChoice: { type: string };
  };
  response: {
    content: V2GenerateResult['content'];
    finishReason: {
      unified: V2GenerateResult['finishReason'];
      raw: string;
    };
    usage: {
      inputTokens: {
        total: number;
        cacheRead: number;
      };
      outputTokens: {
        total: number;
        reasoning: number;
      };
      raw: {
        total_tokens: number;
      };
    };
    providerMetadata: V2GenerateResult['providerMetadata'];
    warnings: V2GenerateResult['warnings'];
  };
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

function toV2GenerateResult(
  response: RecordedFixture['response'],
): V2GenerateResult {
  return {
    content: response.content,
    finishReason: response.finishReason.unified,
    usage: {
      inputTokens: response.usage.inputTokens.total,
      outputTokens: response.usage.outputTokens.total,
      totalTokens: response.usage.raw.total_tokens,
      reasoningTokens: response.usage.outputTokens.reasoning,
      cachedInputTokens: response.usage.inputTokens.cacheRead,
    },
    providerMetadata: response.providerMetadata,
    warnings: response.warnings,
  };
}

async function generateWithRequiredTool(response: V2GenerateResult) {
  let observedToolChoice: unknown;
  let providerReturned = false;
  let stopWhenCalls = 0;
  let repairToolCallCalls = 0;

  try {
    const result = await generateText({
      model: new MockLanguageModelV2({
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
  const recordedResponseReplay = await generateWithRequiredTool(
    toV2GenerateResult(fixture.response),
  );

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
    finishReason: 'stop',
    usage: {
      inputTokens: 1,
      outputTokens: 1,
      totalTokens: 2,
      reasoningTokens: 0,
      cachedInputTokens: 0,
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

  if (
    fixture.request.toolChoice.type !== 'required' ||
    JSON.stringify(recordedResponseReplay.observedToolChoice) !==
      JSON.stringify({ type: 'required' })
  ) {
    throw new Error(
      'Reproduction setup failed: required tool choice was not forwarded.',
    );
  }

  if (
    recordedResponseReplay.kind === 'returned' &&
    recordedResponseReplay.result.toolCalls.length === 0
  ) {
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
