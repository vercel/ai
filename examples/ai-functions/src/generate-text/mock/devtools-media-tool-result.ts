import { DevToolsTelemetry } from '@ai-sdk/devtools';
import { generateText, isStepCount, registerTelemetry, tool } from 'ai';
import { MockLanguageModelV4 } from 'ai/test';
import { z } from 'zod';
import { run } from '../../lib/run';

registerTelemetry(DevToolsTelemetry());

const screenshot = {
  type: 'content' as const,
  value: [
    {
      type: 'text' as const,
      text: 'Screenshot captured successfully.',
    },
    {
      type: 'file' as const,
      filename: 'screenshot.png',
      mediaType: 'image/png',
      data: {
        type: 'data' as const,
        // A small inline PNG payload for a focused, self-contained example.
        data: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAF/gL+AvzZAAAAAElFTkSuQmCC',
      },
    },
  ],
};

const usage = {
  inputTokens: {
    total: 10,
    noCache: 10,
    cacheRead: undefined,
    cacheWrite: undefined,
  },
  outputTokens: {
    total: 5,
    text: 5,
    reasoning: undefined,
  },
};

run(async () => {
  const result = await generateText({
    model: new MockLanguageModelV4({
      doGenerate: [
        {
          content: [
            {
              type: 'tool-call',
              toolCallId: 'screenshot-call',
              toolName: 'captureScreenshot',
              input: '{}',
            },
          ],
          finishReason: { raw: undefined, unified: 'tool-calls' },
          usage,
          warnings: [],
        },
        {
          content: [
            {
              type: 'text',
              text: 'The screenshot was captured.',
            },
          ],
          finishReason: { raw: undefined, unified: 'stop' },
          usage,
          warnings: [],
        },
      ],
    }),
    prompt: 'Capture a screenshot and confirm what happened.',
    tools: {
      captureScreenshot: tool({
        description: 'Capture a screenshot for debugging.',
        inputSchema: z.object({}),
        execute: async () => screenshot,
        toModelOutput: ({ output }) => output,
      }),
    },
    stopWhen: isStepCount(2),
    telemetry: {
      functionId: 'devtools-media-tool-result',
    },
  });

  console.log(result.text);
  console.log(
    'Run `npx @ai-sdk/devtools@latest` and inspect the captureScreenshot tool result to view the image preview.',
  );
});
