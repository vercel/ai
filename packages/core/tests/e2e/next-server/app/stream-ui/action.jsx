'use server';

import { streamUI } from 'ai/rsc';
import { z } from 'zod';

import { MockLanguageModelV1 } from '../../../../../core/test/mock-language-model-v1';
import { convertArrayToReadableStream } from '../../../../../core/test/convert-array-to-readable-stream';

const mockTextModel = new MockLanguageModelV1({
  doStream: async () => {
    return {
      stream: convertArrayToReadableStream([
        { type: 'text-delta', textDelta: `"Hello, ` },
        { type: 'text-delta', textDelta: `world` },
        { type: 'text-delta', textDelta: `!"` },
      ]),
      rawCall: { rawPrompt: 'prompt', rawSettings: {} },
    };
  },
});

const mockToolModel = new MockLanguageModelV1({
  doStream: async () => {
    return {
      stream: convertArrayToReadableStream([
        {
          type: 'tool-call',
          toolCallType: 'function',
          toolCallId: 'call-1',
          toolName: 'tool1',
          args: `{ "value": "value" }`,
        },
      ]),
      rawCall: { rawPrompt: 'prompt', rawSettings: {} },
    };
  },
});

function sleep(ms = 0) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export async function action(testCase) {
  switch (testCase) {
    case 'text': {
      const result = await streamUI({
        model: mockTextModel,
        prompt: '',
      });
      return result.value;
    }
    case 'wrapped-text': {
      const result = await streamUI({
        model: mockTextModel,
        prompt: '',
        text: ({ content }) => <p>AI: {content}</p>,
      });
      return result.value;
    }
    case 'tool': {
      const result = await streamUI({
        model: mockToolModel,
        prompt: '',
        tools: {
          tool1: {
            description: 'test tool 1',
            parameters: z.object({
              value: z.string(),
            }),
            generate: async function* ({ value }) {
              yield 'Loading...';
              await sleep(10);
              return <div>tool1: {value}</div>;
            },
          },
        },
      });
      return result.value;
    }
  }
}
