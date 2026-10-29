import type {
  LanguageModelV4StreamPart,
  LanguageModelV4Usage,
} from '@ai-sdk/provider';
import { WorkflowAgent, type ModelCallStreamPart } from '@ai-sdk/workflow';
import { tool } from 'ai';
import { MockLanguageModelV4, convertArrayToReadableStream } from 'ai/test';
import { z } from 'zod/v4';

const usage: LanguageModelV4Usage = {
  inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 1, text: 1, reasoning: 0 },
};

// A 14 MiB provider-executed tool result, like a large code_interpreter output.
const oversizedOutput = 'x'.repeat(14 * 1024 * 1024);

const agent = new WorkflowAgent({
  model: new MockLanguageModelV4({
    doStream: async () => ({
      stream: convertArrayToReadableStream<LanguageModelV4StreamPart>([
        { type: 'stream-start', warnings: [] },
        {
          type: 'tool-call',
          toolCallId: 'call-1',
          toolName: 'code_interpreter',
          input: '{}',
          providerExecuted: true,
        },
        {
          type: 'tool-result',
          toolCallId: 'call-1',
          toolName: 'code_interpreter',
          result: oversizedOutput,
        },
        {
          type: 'finish',
          finishReason: { unified: 'stop', raw: 'stop' },
          usage,
        },
      ]),
    }),
  }),
  tools: {
    code_interpreter: tool({
      type: 'provider',
      id: 'openai.code_interpreter',
      isProviderExecuted: true,
      args: {},
      inputSchema: z.object({}),
    }),
  },
});

// Emulates Vercel Workflow, which rejects stream chunks over 10 MiB.
const writtenParts: ModelCallStreamPart[] = [];
const writable = new WritableStream<ModelCallStreamPart>({
  write(part) {
    const size = JSON.stringify(part).length;
    if (size > 10 * 1024 * 1024) {
      throw new Error(
        `size ${size} exceeds maximum allowed size of 10485760 bytes`,
      );
    }
    writtenParts.push(part);
  },
});

const result = await agent.stream({
  messages: [{ role: 'user', content: 'Process the file.' }],
  writable,
});

const writtenResult = writtenParts.find(part => part.type === 'tool-result');
const stepResult = result.steps[0]?.toolResults[0];

console.log('Written tool result output:', writtenResult?.output);
console.log(
  'Step result output length:',
  typeof stepResult?.output === 'string' ? stepResult.output.length : 0,
);
