import assert from 'node:assert/strict';
import { MockLanguageModelV3 } from 'ai/test';
import { convertToModelMessages, generateText, tool, type UIMessage } from 'ai';
import { z } from 'zod';

const pendingToolCallId = 'call_pending_approval';
const followUpText = 'Use Fahrenheit instead.';

async function main() {
  const messages: UIMessage[] = [
    {
      id: 'assistant-1',
      role: 'assistant',
      parts: [
        {
          type: 'tool-getWeather',
          state: 'approval-requested',
          toolCallId: pendingToolCallId,
          input: { city: 'Boston', unit: 'celsius' },
          approval: { id: 'approval-1' },
        },
      ],
    },
    {
      id: 'user-2',
      role: 'user',
      parts: [{ type: 'text', text: followUpText }],
    },
  ];

  const modelMessages = await convertToModelMessages(messages, {
    ignoreIncompleteToolCalls: true,
  });

  assert.deepEqual(modelMessages, [
    {
      role: 'user',
      content: [{ type: 'text', text: followUpText }],
    },
  ]);

  const model = new MockLanguageModelV3({
    doGenerate: {
      content: [
        {
          type: 'text',
          text: 'I will adjust the request to use Fahrenheit.',
        },
      ],
      finishReason: { unified: 'stop', raw: 'stop' },
      usage: {
        inputTokens: {
          total: 4,
          noCache: 4,
          cacheRead: undefined,
          cacheWrite: undefined,
        },
        outputTokens: {
          total: 8,
          text: 8,
          reasoning: undefined,
        },
      },
      warnings: [],
    },
  });

  const result = await generateText({
    model,
    messages: modelMessages,
    tools: {
      getWeather: tool({
        inputSchema: z.object({
          city: z.string(),
          unit: z.enum(['celsius', 'fahrenheit']),
        }),
        needsApproval: true,
        execute: async input => input,
      }),
    },
  });

  assert.equal(model.doGenerateCalls.length, 1);
  assert.equal(result.text, 'I will adjust the request to use Fahrenheit.');

  const serializedPrompt = JSON.stringify(model.doGenerateCalls[0].prompt);
  assert.equal(serializedPrompt.includes(pendingToolCallId), false);
  assert.equal(serializedPrompt.includes(followUpText), true);

  console.log(
    'Issue #12709 did not reproduce: the pending approval was omitted and the follow-up model request succeeded.',
  );
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
