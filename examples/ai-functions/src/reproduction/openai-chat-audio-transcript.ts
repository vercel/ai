import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createOpenAI } from '@ai-sdk/openai';

async function main() {
  const fixturePath = fileURLToPath(
    new URL(
      '../../../../packages/openai/src/chat/__fixtures__/openai-audio-gpt-audio-1.5.json',
      import.meta.url,
    ),
  );
  const fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
  const expectedTranscript = fixture.choices[0].message.audio.transcript;

  if (expectedTranscript !== 'Fix the login bug') {
    throw new Error('The recorded audio fixture has an unexpected transcript.');
  }

  fixture.choices[0].message.tool_calls = [
    {
      id: 'call_diagnose_login',
      type: 'function',
      function: {
        name: 'diagnose_login',
        arguments: '{"userId":"42"}',
      },
    },
  ];

  const openai = createOpenAI({
    apiKey: 'test-api-key',
    fetch: async () =>
      new Response(JSON.stringify(fixture), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
  });

  const result = await openai.chat('gpt-audio-1.5').doGenerate({
    prompt: [
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: 'Say only these four words: Fix the login bug',
          },
        ],
      },
    ],
  });

  const toolCall = result.content.find(part => part.type === 'tool-call');
  if (
    toolCall?.type !== 'tool-call' ||
    toolCall.toolName !== 'diagnose_login'
  ) {
    throw new Error('The coexisting tool call was not preserved.');
  }

  const generatedText = result.content
    .filter(part => part.type === 'text')
    .map(part => part.text)
    .join('');

  if (generatedText !== expectedTranscript) {
    console.error(
      `BUG: OpenAI audio transcript was omitted from generated text (expected "${expectedTranscript}", received "${generatedText}").`,
    );
    process.exitCode = 1;
  }
}

main().catch(error => {
  console.error('Reproduction setup failed:', error);
  process.exitCode = 2;
});
