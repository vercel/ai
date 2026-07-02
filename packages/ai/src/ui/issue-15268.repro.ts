import { strict as assert } from 'node:assert';
import { consumeStream } from '../util/consume-stream';
import type { UIMessageChunk } from '../ui-message-stream/ui-message-chunks';
import {
  createStreamingUIMessageState,
  processUIMessageStream,
  type StreamingUIMessageState,
} from './process-ui-message-stream';
import type { UIMessage } from './ui-messages';

function streamFromArray<T>(values: T[]): ReadableStream<T> {
  return new ReadableStream({
    start(controller) {
      for (const value of values) {
        controller.enqueue(value);
      }
      controller.close();
    },
  });
}

const inputChunks: UIMessageChunk[] = [
  { type: 'start', messageId: 'issue-15268-message' },
  { type: 'start-step' },
  {
    type: 'tool-input-available',
    toolCallId: 'issue-15268-tool-call',
    toolName: 'getWeather',
    input: { city: 'London' },
  },
  { type: 'finish-step' },
  { type: 'finish' },
];

const state: StreamingUIMessageState<UIMessage> = createStreamingUIMessageState({
  messageId: 'issue-15268-message',
  lastMessage: undefined,
});

await consumeStream({
  stream: processUIMessageStream({
    stream: streamFromArray(inputChunks),
    runUpdateMessageJob: async job => {
      await job({
        state,
        write: () => {
          // No-op: this reproduction only needs the final accumulated message.
        },
      });
    },
    onError: error => {
      throw error;
    },
    // This intentionally follows the current JSDoc wording: "You can
    // optionally return a result for the tool call, either synchronously or
    // asynchronously."  The cast mirrors non-strict/JavaScript callers that can
    // return a value even though the TypeScript callback type is void.
    onToolCall: (async ({ toolCall }) => {
      assert.equal(toolCall.toolCallId, 'issue-15268-tool-call');
      return { forecast: 'sunny' };
    }) as any,
  }),
  onError: error => {
    throw error;
  },
});

const toolPart = state.message.parts.find(
  part =>
    part.type === 'tool-getWeather' &&
    'toolCallId' in part &&
    part.toolCallId === 'issue-15268-tool-call',
);

console.log(
  'Observed final tool part after returning from onToolCall:',
  JSON.stringify(toolPart, null, 2),
);

// Expected behavior per the current JSDoc in packages/ai/src/ui/chat.ts:
// returning a tool result from onToolCall should attach that output. This
// assertion fails in the current implementation because processUIMessageStream
// awaits onToolCall but discards the returned value.
assert.deepEqual(
  toolPart,
  {
    type: 'tool-getWeather',
    toolCallId: 'issue-15268-tool-call',
    state: 'output-available',
    input: { city: 'London' },
    output: { forecast: 'sunny' },
  },
  'returned onToolCall result should be attached as tool output',
);
