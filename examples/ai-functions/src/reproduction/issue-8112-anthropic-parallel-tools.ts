import { anthropic } from '@ai-sdk/anthropic';
import {
  convertToModelMessages,
  generateText,
  readUIMessageStream,
  streamText,
  tool,
  type ModelMessage,
  type UIMessage,
} from 'ai';
import { z } from 'zod';

const model = anthropic('claude-sonnet-4-6');

const webSearch = anthropic.tools.webSearch_20250305({ maxUses: 1 });

const saveNote = tool({
  description: 'Save a short note.',
  inputSchema: z.object({ note: z.string() }),
  execute: async ({ note }) => ({ saved: note }),
});

function getToolCallIds(messages: ModelMessage[]): string[] {
  return messages.flatMap(message =>
    message.role === 'assistant' && Array.isArray(message.content)
      ? message.content.flatMap(part =>
          part.type === 'tool-call' ? [part.toolCallId] : [],
        )
      : [],
  );
}

async function getLiveWebSearchPart(): Promise<UIMessage['parts'][number]> {
  const result = streamText({
    model,
    prompt:
      'Use web_search to find the official Anthropic home page. Answer briefly.',
    tools: { web_search: webSearch },
    toolChoice: { type: 'tool', toolName: 'web_search' },
  });

  let assistantMessage: UIMessage | undefined;
  for await (const message of readUIMessageStream({
    stream: result.toUIMessageStream(),
  })) {
    assistantMessage = message;
  }

  const webSearchPart = assistantMessage?.parts.find(
    part =>
      part.type === 'tool-web_search' &&
      'providerExecuted' in part &&
      part.providerExecuted === true &&
      'state' in part &&
      part.state === 'output-available',
  );

  if (webSearchPart == null) {
    throw new Error(
      'Live Anthropic response did not contain a completed provider-executed web_search part.',
    );
  }

  return webSearchPart;
}

async function verifyAllCustomParallelCallsAreNotDuplicated() {
  const converted = await convertToModelMessages([
    {
      id: 'custom-assistant',
      role: 'assistant',
      parts: [
        { type: 'step-start' },
        {
          type: 'tool-first',
          toolCallId: 'custom-call-1',
          state: 'output-available',
          input: { value: 1 },
          output: { value: 1 },
        },
        {
          type: 'tool-second',
          toolCallId: 'custom-call-2',
          state: 'output-available',
          input: { value: 2 },
          output: { value: 2 },
        },
      ],
    } as UIMessage,
  ]);

  const toolCallIds = getToolCallIds(converted);
  if (
    toolCallIds.length !== 2 ||
    new Set(toolCallIds).size !== 2 ||
    !toolCallIds.includes('custom-call-1') ||
    !toolCallIds.includes('custom-call-2')
  ) {
    throw new Error(
      `Duplicate custom tool call ids after convertToModelMessages: ${toolCallIds.join(', ')}`,
    );
  }
}

async function main() {
  const liveWebSearchPart = await getLiveWebSearchPart();

  const uiMessages = [
    {
      id: 'user-1',
      role: 'user',
      parts: [
        {
          type: 'text',
          text: 'Save a note and search the web in parallel.',
        },
      ],
    },
    {
      id: 'assistant-1',
      role: 'assistant',
      parts: [
        { type: 'step-start' },
        {
          type: 'tool-save_note',
          toolCallId: 'toolu_issue_8112_custom',
          state: 'output-available',
          input: { note: 'Anthropic home page search' },
          output: { saved: true },
        },
        liveWebSearchPart,
        { type: 'step-start' },
        {
          type: 'text',
          text: 'Both tools finished.',
          state: 'done',
        },
      ],
    },
    {
      id: 'user-2',
      role: 'user',
      parts: [{ type: 'text', text: 'Reply with OK only.' }],
    },
  ] as UIMessage[];

  const modelMessages = await convertToModelMessages(uiMessages, {
    tools: {
      save_note: saveNote,
      web_search: webSearch,
    },
  });

  const firstAssistantToolCallIds = getToolCallIds(modelMessages);
  if (
    !firstAssistantToolCallIds.includes('toolu_issue_8112_custom') ||
    firstAssistantToolCallIds.length < 2
  ) {
    throw new Error(
      'The mixed provider/custom parallel-tool setup was not constructed.',
    );
  }

  const customResultIsSeparate = modelMessages.some(
    message =>
      message.role === 'tool' &&
      message.content.some(
        part =>
          part.type === 'tool-result' &&
          part.toolCallId === 'toolu_issue_8112_custom',
      ),
  );

  if (!customResultIsSeparate) {
    throw new Error(
      'convertToModelMessages did not produce the reported separate custom tool-result message.',
    );
  }

  const nextTurn = await generateText({
    model,
    messages: modelMessages,
    maxOutputTokens: 32,
    toolChoice: 'none',
    tools: {
      save_note: saveNote,
      web_search: webSearch,
    },
  });

  if (nextTurn.text.trim().length === 0) {
    throw new Error(
      'Anthropic accepted the request but did not complete the next turn.',
    );
  }

  await verifyAllCustomParallelCallsAreNotDuplicated();

  console.log(
    'Issue #8112 not reproduced: Anthropic accepted the converted mixed parallel-tool history, completed the next turn, and custom tool call ids remained unique.',
  );
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
