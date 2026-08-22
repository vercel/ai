import assert from 'node:assert/strict';
import {
  convertToModelMessages,
  generateText,
  MissingToolResultsError,
  tool,
  type UIMessage,
} from 'ai';
import { MockLanguageModelV3 } from 'ai/test';
import { z } from 'zod/v4';

const tools = {
  git_sync: tool({
    description: 'Demo tool requiring approval',
    inputSchema: z.object({ message: z.string() }),
    needsApproval: true,
    execute: async () => 'ok',
  }),
};

function messagesWithToolState(
  state: string | undefined,
  extra: Record<string, unknown> = {},
): UIMessage[] {
  return [
    {
      id: 'u1',
      role: 'user',
      parts: [{ type: 'text', text: 'sync my changes' }],
    },
    {
      id: 'a1',
      role: 'assistant',
      parts: [
        { type: 'step-start' },
        {
          type: 'tool-git_sync',
          toolCallId: 'toolu_1',
          state,
          input: { message: 'commit' },
          ...extra,
        } as any,
      ],
    },
    {
      id: 'u2',
      role: 'user',
      parts: [{ type: 'text', text: 'hello?' }],
    },
  ];
}

const cases: Array<{
  name: string;
  messages: UIMessage[];
}> = [
  {
    name: 'approval-requested',
    messages: messagesWithToolState('approval-requested', {
      approval: { id: 'appr_1' },
    }),
  },
  {
    name: 'approval-responded',
    messages: messagesWithToolState('approval-responded', {
      approval: { id: 'appr_1', approved: true },
    }),
  },
  {
    name: 'missing state',
    messages: messagesWithToolState(undefined),
  },
  {
    name: 'control: input-available',
    messages: messagesWithToolState('input-available'),
  },
];

async function main() {
  const missingToolResultCases: string[] = [];
  const modelNotReachedCases: string[] = [];

  for (const testCase of cases) {
    const model = new MockLanguageModelV3({
      doGenerate: {
        content: [{ type: 'text', text: 'ok' }],
        finishReason: { unified: 'stop', raw: 'stop' },
        usage: {
          inputTokens: {
            total: 1,
            noCache: 1,
            cacheRead: undefined,
            cacheWrite: undefined,
          },
          outputTokens: {
            total: 1,
            text: 1,
            reasoning: undefined,
          },
        },
        warnings: [],
      },
    });

    const modelMessages = await convertToModelMessages(testCase.messages, {
      tools,
      ignoreIncompleteToolCalls: true,
    });

    try {
      await generateText({
        model,
        tools,
        messages: modelMessages,
      });
      console.log(`${testCase.name}: next generateText reached the model`);
    } catch (error) {
      if (!MissingToolResultsError.isInstance(error)) {
        throw error;
      }

      missingToolResultCases.push(testCase.name);
      console.log(
        `${testCase.name}: next generateText threw ${error.name}: ${error.message}`,
      );
    }

    if (model.doGenerateCalls.length === 0) {
      modelNotReachedCases.push(testCase.name);
    }
  }

  const affectedCases = ['approval-requested', 'missing state'];
  const controlCases = ['approval-responded', 'control: input-available'];

  assert.deepEqual(
    missingToolResultCases.filter(name => !affectedCases.includes(name)),
    [],
    'Control cases must not trigger AI_MissingToolResultsError',
  );
  assert.deepEqual(
    modelNotReachedCases.filter(name => controlCases.includes(name)),
    [],
    'Control cases must reach the model',
  );

  if (affectedCases.some(name => missingToolResultCases.includes(name))) {
    assert.deepEqual(
      missingToolResultCases,
      affectedCases,
      'Both reported incomplete states must reproduce the same primary failure',
    );
    assert.deepEqual(
      modelNotReachedCases,
      affectedCases,
      'Both reported incomplete states must prevent the next model call',
    );

    throw new Error(
      'ISSUE_18451_REPRODUCED: approval-requested and missing-state parts caused AI_MissingToolResultsError on the next generateText call',
    );
  }

  assert.deepEqual(
    modelNotReachedCases,
    [],
    'All cases should remain usable when incomplete tool calls are ignored',
  );
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
