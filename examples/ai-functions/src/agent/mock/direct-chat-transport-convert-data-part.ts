import { DirectChatTransport, ToolLoopAgent, type UIMessage } from 'ai';
import {
  convertArrayToReadableStream,
  convertReadableStreamToArray,
  MockLanguageModelV4,
} from 'ai/test';
import { run } from '../../lib/run';

type ReportMessage = UIMessage<
  unknown,
  {
    report: { text: string };
  },
  {}
>;

run(async () => {
  const model = new MockLanguageModelV4({
    doStream: async () => ({
      stream: convertArrayToReadableStream([
        { type: 'stream-start', warnings: [] },
        {
          type: 'finish',
          finishReason: { unified: 'stop', raw: 'stop' },
          usage: {
            inputTokens: {
              total: 1,
              noCache: 1,
              cacheRead: undefined,
              cacheWrite: undefined,
            },
            outputTokens: { total: 0, text: 0, reasoning: undefined },
          },
        },
      ]),
    }),
  });

  const transport = new DirectChatTransport<
    never,
    {},
    Record<string, unknown>,
    never,
    ReportMessage
  >({
    agent: new ToolLoopAgent({ model }),
    convertDataPart: part => {
      if (part.type === 'data-report') {
        return { type: 'text', text: part.data.text };
      }
    },
  });

  await convertReadableStreamToArray(
    await transport.sendMessages({
      chatId: 'report-chat',
      messageId: undefined,
      trigger: 'submit-message',
      messages: [
        {
          id: 'user-1',
          role: 'user',
          parts: [
            { type: 'text', text: 'Summarize this report:' },
            {
              type: 'data-report',
              data: { text: 'Revenue increased by 20%.' },
            },
          ],
        },
      ],
      abortSignal: undefined,
    }),
  );

  console.dir(model.doStreamCalls[0].prompt, { depth: null });
});
