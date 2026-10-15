import { DevToolsTelemetry } from '@ai-sdk/devtools';
import { generateText, registerTelemetry, tool } from 'ai';
import { MockLanguageModelV4 } from 'ai/test';
import { z } from 'zod';
import { run } from '../../lib/run';

registerTelemetry(DevToolsTelemetry());

// A small inline PNG payload for a focused, self-contained example.
const screenshotBase64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAF/gL+AvzZAAAAAElFTkSuQmCC';

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
      ],
    }),
    prompt: 'Capture a screenshot and confirm what happened.',
    tools: {
      captureScreenshot: tool({
        description: 'Capture a screenshot for debugging.',
        inputSchema: z.object({}),
        execute: async () => ({ base64: screenshotBase64 }),
        toModelOutput: ({ output }) => ({
          type: 'content',
          value: [
            {
              type: 'text',
              text: 'Screenshot captured successfully.',
            },
            {
              type: 'file',
              filename: 'screenshot.png',
              mediaType: 'image/png',
              data: {
                type: 'data',
                data: output.base64,
              },
            },
          ],
        }),
      }),
    },
    telemetry: {
      functionId: 'devtools-media-tool-result',
    },
  });

  console.log(`Captured ${result.toolResults.length} tool result.`);
  console.log(
    'Run `npx @ai-sdk/devtools@latest` and inspect the captureScreenshot tool result to view the image preview.',
  );
});
