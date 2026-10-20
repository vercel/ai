import {
  convertToModelMessages,
  generateText,
  InvalidToolApprovalSignatureError,
  readUIMessageStream,
  simulateReadableStream,
  streamText,
  tool,
  type UIMessage,
} from 'ai';
import { MockLanguageModelV3 } from 'ai/test';
import { z } from 'zod/v4';

const secret = new TextEncoder().encode('0123456789abcdef0123456789abcdef');

const usage = {
  inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 1, text: 1, reasoning: 0 },
};

let executions = 0;
const tools = {
  renamedTool: tool({
    inputSchema: z.object({ query: z.string() }),
    execute: async ({ query }) => {
      executions++;
      return `ran with ${query}`;
    },
    needsApproval: true,
  }),
};

async function main() {
  const result = streamText({
    model: new MockLanguageModelV3({
      doStream: async () => ({
        stream: simulateReadableStream({
          chunks: [
            { type: 'stream-start', warnings: [] },
            {
              type: 'tool-input-start',
              id: 'call-1',
              toolName: 'originalTool',
            },
            {
              type: 'tool-input-delta',
              id: 'call-1',
              delta: '{"query":"x"}',
            },
            { type: 'tool-input-end', id: 'call-1' },
            {
              type: 'tool-call',
              toolCallId: 'call-1',
              toolName: 'originalTool',
              input: '{"query":"x"}',
            },
            {
              type: 'finish',
              finishReason: { unified: 'tool-calls', raw: 'tool-calls' },
              usage,
            },
          ],
        }),
      }),
    }),
    tools,
    experimental_toolApprovalSecret: secret,
    experimental_repairToolCall: async ({ toolCall }) => ({
      ...toolCall,
      toolName: 'renamedTool',
    }),
    prompt: 'go',
  });

  let assistant: UIMessage | undefined;
  for await (const message of readUIMessageStream({
    stream: result.toUIMessageStream(),
  })) {
    assistant = message;
  }

  if (assistant == null) {
    throw new Error('The stream did not produce an assistant UI message.');
  }

  const approvalPart = assistant.parts.find(
    part => 'state' in part && part.state === 'approval-requested',
  );

  if (
    approvalPart == null ||
    !('approval' in approvalPart) ||
    approvalPart.approval == null
  ) {
    throw new Error('The repaired tool call did not request approval.');
  }

  const approvedAssistant: UIMessage = {
    ...assistant,
    parts: assistant.parts.map(part =>
      part === approvalPart
        ? {
            ...part,
            state: 'approval-responded' as const,
            approval: { ...approvalPart.approval, approved: true },
          }
        : part,
    ),
  };

  try {
    const resumed = await generateText({
      model: new MockLanguageModelV3({
        doGenerate: async () => ({
          content: [{ type: 'text', text: 'done' }],
          finishReason: { unified: 'stop', raw: 'stop' },
          usage,
          warnings: [],
        }),
      }),
      tools,
      experimental_toolApprovalSecret: secret,
      messages: await convertToModelMessages(
        [
          { id: 'u1', role: 'user', parts: [{ type: 'text', text: 'go' }] },
          approvedAssistant,
        ],
        { tools },
      ),
    });

    if (approvalPart.type !== 'tool-renamedTool') {
      throw new Error(
        `Expected repaired UI part type "tool-renamedTool", received "${approvalPart.type}".`,
      );
    }

    if (executions !== 1) {
      throw new Error(
        `Expected the approved repaired tool to execute once, received ${executions} executions.`,
      );
    }

    if (resumed.text !== 'done') {
      throw new Error(
        `Expected resumed generation text "done", received "${resumed.text}".`,
      );
    }

    console.log('Repaired tool approval resumed successfully.');
  } catch (error) {
    if (
      InvalidToolApprovalSignatureError.isInstance(error) &&
      approvalPart.type === 'tool-originalTool'
    ) {
      throw new Error(
        'ISSUE_23329: approved repaired tool call failed signature verification because the UI part retained tool-originalTool',
        { cause: error },
      );
    }

    throw error;
  }
}

main();
