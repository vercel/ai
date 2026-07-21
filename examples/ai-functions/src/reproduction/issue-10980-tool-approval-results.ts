import assert from 'node:assert/strict';
import type { LanguageModelV4Prompt } from '@ai-sdk/provider';
import {
  convertToModelMessages,
  lastAssistantMessageIsCompleteWithApprovalResponses,
  stepCountIs,
  streamText,
  tool,
  type UIMessage,
} from 'ai';
import { convertArrayToReadableStream, MockLanguageModelV4 } from 'ai/test';
import { z } from 'zod';

const usage = {
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
};

function createModel(prompts: LanguageModelV4Prompt[]) {
  return new MockLanguageModelV4({
    provider: 'anthropic-compatible-reproduction',
    doStream: async options => {
      prompts.push(options.prompt);
      assertNoOrphanedToolCalls(options.prompt);

      return {
        stream: convertArrayToReadableStream([
          { type: 'text-start', id: 'text-1' },
          {
            type: 'text-delta',
            id: 'text-1',
            delta: 'Approval handled.',
          },
          { type: 'text-end', id: 'text-1' },
          {
            type: 'finish',
            finishReason: { unified: 'stop', raw: 'stop' },
            usage,
          },
        ]),
      };
    },
  });
}

function assertNoOrphanedToolCalls(prompt: LanguageModelV4Prompt) {
  for (let index = 0; index < prompt.length; index++) {
    const message = prompt[index];
    if (message.role !== 'assistant') {
      continue;
    }

    const toolCallIds = message.content.flatMap(part =>
      part.type === 'tool-call' && !part.providerExecuted
        ? [part.toolCallId]
        : [],
    );

    if (toolCallIds.length === 0) {
      continue;
    }

    const nextMessage = prompt[index + 1];
    assert.equal(
      nextMessage?.role,
      'tool',
      `Anthropic-invalid prompt: tool_use ids without an immediately following tool_result message: ${toolCallIds.join(
        ', ',
      )}`,
    );

    const resultIds = new Set(
      nextMessage.content
        .filter(part => part.type === 'tool-result')
        .map(part => part.toolCallId),
    );

    for (const toolCallId of toolCallIds) {
      assert.ok(
        resultIds.has(toolCallId),
        `Anthropic-invalid prompt: tool_use id without a matching tool_result: ${toolCallId}`,
      );
    }
  }
}

function createApprovalMessage(approved: boolean): UIMessage {
  return {
    id: approved ? 'assistant-approved' : 'assistant-denied',
    role: 'assistant',
    parts: [
      { type: 'step-start' },
      {
        type: 'tool-update_current_theme_tokens',
        state: 'approval-responded',
        toolCallId: approved ? 'call-approved' : 'call-denied',
        input: {
          operations: [{ token: 'color.primary', value: '#000000' }],
          reasoning: 'Apply the requested theme token.',
        },
        approval: {
          id: approved ? 'approval-approved' : 'approval-denied',
          approved,
          reason: approved ? 'Apply one operation.' : 'User rejected changes.',
        },
      },
    ],
  } as UIMessage;
}

async function runApprovalScenario(approved: boolean) {
  const approvalMessage = createApprovalMessage(approved);
  const uiMessages: UIMessage[] = [
    {
      id: approved ? 'user-approved' : 'user-denied',
      role: 'user',
      parts: [{ type: 'text', text: 'Update the current theme tokens.' }],
    },
    approvalMessage,
  ];

  assert.equal(
    lastAssistantMessageIsCompleteWithApprovalResponses({
      messages: uiMessages,
    }),
    true,
    'sendAutomaticallyWhen should resume after the approval response.',
  );

  const modelMessages = await convertToModelMessages(uiMessages);
  const prompts: LanguageModelV4Prompt[] = [];
  let executions = 0;

  const result = streamText({
    model: createModel(prompts),
    messages: modelMessages,
    tools: {
      update_current_theme_tokens: tool({
        needsApproval: true,
        inputSchema: z.object({
          operations: z.array(
            z.object({
              token: z.string(),
              value: z.string(),
            }),
          ),
          reasoning: z.string(),
        }),
        execute: async input => {
          executions++;
          return {
            success: true,
            applied: input.operations.length,
          };
        },
      }),
    },
    stopWhen: stepCountIs(3),
    maxRetries: 0,
  });

  await result.consumeStream();

  assert.equal(prompts.length, 1, 'The model should be resumed once.');
  assertNoOrphanedToolCalls(prompts[0]);
  assert.equal(
    executions,
    approved ? 1 : 0,
    approved
      ? 'An approved tool should execute exactly once.'
      : 'A denied tool must not execute.',
  );

  const toolResults = prompts[0].flatMap(message =>
    message.role === 'tool'
      ? message.content.filter(part => part.type === 'tool-result')
      : [],
  );
  const expectedToolCallId = approved ? 'call-approved' : 'call-denied';

  assert.equal(
    toolResults.filter(part => part.toolCallId === expectedToolCallId).length,
    1,
    'The provider prompt should contain exactly one matching tool result.',
  );

  return {
    approved,
    executions,
    prompt: prompts[0],
  };
}

async function checkPendingApprovalFiltering() {
  const messages: UIMessage[] = [
    {
      id: 'user-pending',
      role: 'user',
      parts: [{ type: 'text', text: 'Update the current theme tokens.' }],
    },
    {
      id: 'assistant-pending',
      role: 'assistant',
      parts: [
        { type: 'step-start' },
        {
          type: 'tool-update_current_theme_tokens',
          state: 'approval-requested',
          toolCallId: 'call-pending',
          input: {
            operations: [{ token: 'color.primary', value: '#000000' }],
            reasoning: 'Apply the requested theme token.',
          },
          approval: { id: 'approval-pending' },
        },
      ],
    } as UIMessage,
  ];

  const converted = await convertToModelMessages(messages, {
    ignoreIncompleteToolCalls: true,
  });

  return {
    ignored: !converted.some(
      message =>
        message.role === 'assistant' &&
        Array.isArray(message.content) &&
        message.content.some(
          part =>
            part.type === 'tool-call' && part.toolCallId === 'call-pending',
        ),
    ),
    converted,
  };
}

async function main() {
  const approved = await runApprovalScenario(true);
  const denied = await runApprovalScenario(false);
  const pendingApprovalFiltering = await checkPendingApprovalFiltering();

  console.log(
    JSON.stringify(
      {
        packageVersion: 'ai@7.0.33 (workspace main)',
        expected:
          'After an approval response, approved tools execute exactly once, denied tools do not execute, and the next provider prompt contains one matching tool_result.',
        approved: {
          executions: approved.executions,
          providerPromptHasNoOrphanedToolCalls: true,
        },
        denied: {
          executions: denied.executions,
          providerPromptHasNoOrphanedToolCalls: true,
        },
        sendAutomaticallyWhenPredicate: true,
        secondaryPendingApprovalFiltering: pendingApprovalFiltering,
      },
      null,
      2,
    ),
  );
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
