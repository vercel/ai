import type { LanguageModelV4StreamPart } from '@ai-sdk/provider';
import { generateId, simulateReadableStream } from 'ai';
import { MockLanguageModelV4 } from 'ai/test';

// Tests replace only the model. useChat, streamText, and the WebSocket protocol
// still run end to end over a real socket.
export const mockModel = new MockLanguageModelV4({
  doStream: async ({ prompt }) => {
    const last = prompt.at(-1);
    const text =
      last?.role === 'user'
        ? last.content
            .filter(part => part.type === 'text')
            .map(part => part.text)
            .join('')
        : '';
    const toolResult =
      last?.role === 'tool'
        ? last.content.find(part => part.type === 'tool-result')
        : undefined;
    const timezone =
      toolResult?.output.type === 'text' ? toolResult.output.value : 'UTC';
    const callTool = /time\s?zone/i.test(text);
    const chunks: LanguageModelV4StreamPart[] = [
      { type: 'stream-start', warnings: [] },
    ];

    if (callTool) {
      chunks.push({
        type: 'tool-call',
        toolCallId: generateId(),
        toolName: 'getTimezone',
        input: '{}',
      });
    } else {
      const response = toolResult
        ? `Your browser time zone is ${timezone}.`
        : `You said: ${text}. This response streamed over WebSocket.`;
      chunks.push({ type: 'text-start', id: 'text-1' });
      for (const delta of response) {
        chunks.push({ type: 'text-delta', id: 'text-1', delta });
      }
      chunks.push({ type: 'text-end', id: 'text-1' });
    }
    chunks.push({
      type: 'finish',
      finishReason: {
        unified: callTool ? 'tool-calls' : 'stop',
        raw: undefined,
      },
      usage: {
        inputTokens: {
          total: 1,
          noCache: 1,
          cacheRead: undefined,
          cacheWrite: undefined,
        },
        outputTokens: { total: 1, text: 1, reasoning: undefined },
      },
    });
    return { stream: simulateReadableStream({ chunks, chunkDelayInMs: 25 }) };
  },
});
