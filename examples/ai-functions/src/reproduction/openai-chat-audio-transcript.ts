import fs from 'node:fs';

import { createOpenAI } from '@ai-sdk/openai';
import { generateText, tool } from 'ai';
import { z } from 'zod';

async function main() {
  const response = JSON.parse(
    fs.readFileSync(
      new URL(
        '../../../../packages/openai/src/chat/__fixtures__/openai-audio-gpt-audio-1.5.json',
        import.meta.url,
      ),
      'utf8',
    ),
  );
  response.choices[0].message.tool_calls = [
    {
      id: 'call_audio',
      type: 'function',
      function: {
        name: 'fixIssue',
        arguments: '{"issue":"login"}',
      },
    },
  ];

  const openai = createOpenAI({
    apiKey: 'test-api-key',
    fetch: async () =>
      new Response(JSON.stringify(response), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
  });
  const result = await generateText({
    model: openai.chat('gpt-audio-1.5'),
    prompt: 'Say exactly: Fix the login bug',
    tools: {
      fixIssue: tool({
        inputSchema: z.object({ issue: z.string() }),
      }),
    },
  });

  if (
    result.toolCalls.length !== 1 ||
    result.toolCalls[0].toolCallId !== 'call_audio' ||
    result.toolCalls[0].toolName !== 'fixIssue'
  ) {
    throw new Error('Expected the coexisting tool call to remain available.');
  }

  if (result.text !== 'Fix the login bug') {
    throw new Error(
      `ISSUE_21289_AUDIO_TRANSCRIPT_LOST: expected "Fix the login bug", received ${JSON.stringify(result.text)}`,
    );
  }

  console.log('Audio transcript and coexisting tool call were preserved.');
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
