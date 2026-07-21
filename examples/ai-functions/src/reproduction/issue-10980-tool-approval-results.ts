import assert from 'node:assert/strict';
import {
  convertToModelMessages,
  lastAssistantMessageIsCompleteWithApprovalResponses,
  streamText,
  tool,
  type ModelMessage,
  type UIMessage,
} from 'ai';
import { convertArrayToReadableStream, MockLanguageModelV3 } from 'ai/test';
import { z } from 'zod';

const toolCallId = 'tooluse_issue_10980';
const approvalId = 'approval_issue_10980';

function createApprovalMessage(approved: boolean): UIMessage {
  return {
    id: `assistant-${approved ? 'approved' : 'denied'}`,
    role: 'assistant',
    parts: [
      { type: 'step-start' },
      {
        type: 'tool-update_current_theme_tokens',
        toolCallId,
        state: 'approval-responded',
        input: {
          operations: [{ token: 'primary', value: '#000000' }],
          reasoning: 'Apply the requested theme change',
        },
        approval: {
          id: approvalId,
          approved,
          reason: approved ? 'Apply the change' : 'Reject the change',
        },
      },
    ],
  };
}

function createPendingApprovalMessage(): UIMessage {
  return {
    id: 'assistant-pending',
    role: 'assistant',
    parts: [
      { type: 'step-start' },
      {
        type: 'tool-update_current_theme_tokens',
        toolCallId,
        state: 'approval-requested',
        input: {
          operations: [{ token: 'primary', value: '#000000' }],
          reasoning: 'Apply the requested theme change',
        },
        approval: { id: approvalId },
      },
    ],
  };
}

function createModel() {
  return new MockLanguageModelV3({
    provider: 'anthropic-compatible-mock',
    doStream: async () => ({
      stream: convertArrayToReadableStream([
        { type: 'text-start', id: 'text-1' },
        { type: 'text-delta', id: 'text-1', delta: 'continued' },
        { type: 'text-end', id: 'text-1' },
        {
          type: 'finish',
          finishReason: { raw: undefined, unified: 'stop' },
          usage: {
            inputTokens: {
              total: 10,
              noCache: 10,
              cacheRead: undefined,
              cacheWrite: undefined,
            },
            outputTokens: {
              total: 1,
              text: 1,
              reasoning: undefined,
            },
          },
        },
      ]),
    }),
  });
}

function countParts(
  messages: ModelMessage[],
  type: 'tool-call' | 'tool-result',
): number {
  return messages.reduce((count, message) => {
    if (typeof message.content === 'string') {
      return count;
    }

    return count + message.content.filter(part => part.type === type).length;
  }, 0);
}

function getToolCallIds(
  messages: ModelMessage[],
  type: 'tool-call' | 'tool-result',
): string[] {
  const ids: string[] = [];

  for (const message of messages) {
    if (typeof message.content === 'string') {
      continue;
    }

    for (const part of message.content) {
      if (part.type === type) {
        ids.push(part.toolCallId);
      }
    }
  }

  return ids;
}

async function runApprovalCase(approved: boolean) {
  let executionCount = 0;
  const uiMessages: UIMessage[] = [
    {
      id: 'user-1',
      role: 'user',
      parts: [{ type: 'text', text: 'Update the theme tokens.' }],
    },
    createApprovalMessage(approved),
  ];

  assert.equal(
    lastAssistantMessageIsCompleteWithApprovalResponses({
      messages: uiMessages,
    }),
    true,
    'the configured sendAutomaticallyWhen predicate should resume the chat',
  );

  const messages = await convertToModelMessages(uiMessages);
  const model = createModel();
  const tools = {
    update_current_theme_tokens: tool({
      inputSchema: z.object({
        operations: z.array(z.object({ token: z.string(), value: z.string() })),
        reasoning: z.string(),
      }),
      needsApproval: true,
      execute: async input => {
        executionCount++;
        return {
          success: true,
          applied: input.operations.length,
        };
      },
    }),
  };

  const result = streamText({ model, messages, tools });
  await result.consumeStream();

  assert.equal(
    model.doStreamCalls.length,
    1,
    'the model should be called once',
  );
  const providerPrompt = model.doStreamCalls[0].prompt;
  assert.equal(
    countParts(providerPrompt, 'tool-call'),
    1,
    'the provider prompt should contain the original tool call',
  );
  assert.equal(
    countParts(providerPrompt, 'tool-result'),
    1,
    'the provider prompt should contain one matching terminal tool result',
  );
  assert.deepEqual(
    getToolCallIds(providerPrompt, 'tool-result'),
    getToolCallIds(providerPrompt, 'tool-call'),
    'the terminal tool result should match the original tool call ID',
  );

  if (approved) {
    assert.equal(executionCount, 1, 'an approved tool should execute once');
  } else {
    assert.equal(executionCount, 0, 'a denied tool should not execute');
  }

  return { executionCount, providerPrompt };
}

async function main() {
  const approved = await runApprovalCase(true);
  const denied = await runApprovalCase(false);

  const pendingMessages = await convertToModelMessages(
    [createPendingApprovalMessage()],
    { ignoreIncompleteToolCalls: true },
  );
  const pendingToolCalls = countParts(pendingMessages, 'tool-call');
  const pendingToolResults = countParts(pendingMessages, 'tool-result');

  assert.equal(
    pendingToolCalls,
    1,
    'the current incomplete-tool filter still retains approval-requested calls',
  );
  assert.equal(pendingToolResults, 0);

  console.log(
    JSON.stringify(
      {
        approved: {
          executionCount: approved.executionCount,
          toolCalls: countParts(approved.providerPrompt, 'tool-call'),
          toolResults: countParts(approved.providerPrompt, 'tool-result'),
        },
        denied: {
          executionCount: denied.executionCount,
          toolCalls: countParts(denied.providerPrompt, 'tool-call'),
          toolResults: countParts(denied.providerPrompt, 'tool-result'),
        },
        automaticResumePredicate: true,
        pendingApprovalConversion: {
          toolCalls: pendingToolCalls,
          toolResults: pendingToolResults,
        },
      },
      null,
      2,
    ),
  );
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
