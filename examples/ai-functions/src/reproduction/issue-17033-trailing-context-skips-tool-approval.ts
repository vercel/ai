import { convertArrayToReadableStream } from '@ai-sdk/provider-utils/test';
import { streamText, tool, type ModelMessage } from 'ai';
import { MockLanguageModelV4 } from 'ai/test';
import { z } from 'zod';

const usage = {
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
};

async function runScenario(trailingContext: boolean) {
  let executeCount = 0;

  const model = new MockLanguageModelV4({
    doStream: async () => ({
      stream: convertArrayToReadableStream([
        { type: 'stream-start', warnings: [] },
        { type: 'text-start', id: 'text-1' },
        {
          type: 'text-delta',
          id: 'text-1',
          delta: 'Model continued.',
        },
        { type: 'text-end', id: 'text-1' },
        {
          type: 'finish',
          finishReason: { unified: 'stop', raw: 'stop' },
          usage,
        },
      ]),
    }),
  });

  const messages: ModelMessage[] = [
    { role: 'user', content: 'Perform the approved action.' },
    {
      role: 'assistant',
      content: [
        {
          type: 'tool-call',
          toolCallId: 'call-1',
          toolName: 'performAction',
          input: { value: 'approved side effect' },
        },
        {
          type: 'tool-approval-request',
          approvalId: 'approval-1',
          toolCallId: 'call-1',
        },
      ],
    },
    {
      role: 'tool',
      content: [
        {
          type: 'tool-approval-response',
          approvalId: 'approval-1',
          approved: true,
        },
      ],
    },
  ];

  if (trailingContext) {
    messages.push({
      role: 'user',
      content: 'Supplemental context added before resuming.',
    });
  }

  const result = streamText({
    model,
    messages,
    tools: {
      performAction: tool({
        inputSchema: z.object({ value: z.string() }),
        execute: async () => {
          executeCount++;
          return 'action completed';
        },
      }),
    },
    toolApproval: {
      performAction: 'user-approval',
    },
  });

  await result.consumeStream();

  return {
    executeCount,
    providerPrompt: model.doStreamCalls[0]?.prompt,
  };
}

async function main() {
  const control = await runScenario(false);
  const withTrailingContext = await runScenario(true);

  console.log(
    JSON.stringify(
      {
        control,
        withTrailingContext,
      },
      null,
      2,
    ),
  );

  if (control.executeCount !== 1) {
    throw new Error(
      `Invalid control: expected the approved tool to execute once without trailing context, but it executed ${control.executeCount} times.`,
    );
  }

  if (withTrailingContext.executeCount !== 1) {
    throw new Error(
      `Reproduced issue #17033: expected the approved tool to execute once with trailing user context, but it executed ${withTrailingContext.executeCount} times.`,
    );
  }
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
