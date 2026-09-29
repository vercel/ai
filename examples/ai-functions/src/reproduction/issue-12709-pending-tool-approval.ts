import 'dotenv/config';
import { openai } from '@ai-sdk/openai';
import {
  APICallError,
  convertToModelMessages,
  generateText,
  MissingToolResultsError,
  tool,
  type ModelMessage,
  type UIMessage,
} from 'ai';
import assert from 'node:assert/strict';
import { z } from 'zod';

const pendingToolCallId = 'call_pending_approval';

const uiMessages: UIMessage[] = [
  {
    id: 'assistant-with-pending-approval',
    role: 'assistant',
    parts: [
      {
        type: 'tool-rewriteDraft',
        toolCallId: pendingToolCallId,
        state: 'approval-requested',
        input: { title: 'Original title' },
        approval: { id: 'approval_pending' },
      },
    ],
  },
  {
    id: 'follow-up-user-message',
    role: 'user',
    parts: [
      {
        type: 'text',
        text: 'Do not run that tool yet. Change its title to "Revised title".',
      },
    ],
  },
];

const tools = {
  rewriteDraft: tool({
    description: 'Rewrite a draft with a new title.',
    inputSchema: z.object({ title: z.string() }),
    needsApproval: true,
    execute: async ({ title }) => ({ title }),
  }),
};

function containsPendingToolCall(messages: ModelMessage[]) {
  return messages.some(
    message =>
      message.role === 'assistant' &&
      Array.isArray(message.content) &&
      message.content.some(
        part =>
          part.type === 'tool-call' && part.toolCallId === pendingToolCallId,
      ),
  );
}

function isReportedFailure(error: unknown) {
  if (MissingToolResultsError.isInstance(error)) {
    return error.toolCallIds.includes(pendingToolCallId);
  }

  if (!APICallError.isInstance(error)) {
    return false;
  }

  return `${error.message}\n${error.responseBody ?? ''}`.includes(
    'No tool output found for function call',
  );
}

async function sendFollowUp(messages: ModelMessage[]) {
  return generateText({
    model: openai('gpt-5-nano'),
    messages,
    tools,
    toolChoice: 'none',
    maxOutputTokens: 256,
    maxRetries: 0,
  });
}

async function main() {
  // Current AI SDK documentation offers this opt-in as a workaround for
  // incomplete calls. Exercise it first so provider access is verified before
  // the reported default conversion path.
  const filteredMessages = await convertToModelMessages(uiMessages, {
    ignoreIncompleteToolCalls: true,
  });
  assert.equal(
    containsPendingToolCall(filteredMessages),
    false,
    'ignoreIncompleteToolCalls did not remove the pending approval',
  );
  await sendFollowUp(filteredMessages);

  const defaultMessages = await convertToModelMessages(uiMessages);

  try {
    await sendFollowUp(defaultMessages);
  } catch (error) {
    if (isReportedFailure(error)) {
      throw new Error(
        'ISSUE_12709_REPRODUCED: follow-up user message was rejected while tool approval was pending\n' +
          `Observed: ${
            error instanceof Error ? `${error.name}: ${error.message}` : error
          }`,
      );
    }
    throw error;
  }

  console.log(
    'ISSUE_12709_NOT_REPRODUCED: follow-up user message succeeded while tool approval was pending',
  );
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
