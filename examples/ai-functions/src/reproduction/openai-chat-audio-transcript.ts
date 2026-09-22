import { readFile } from 'node:fs/promises';
import { createOpenAI } from '@ai-sdk/openai';
import { generateText } from 'ai';

const failureSignal =
  'Issue #21289 reproduced: OpenAI audio transcript was not exposed as text content.';

async function main() {
  const fixture = JSON.parse(
    await readFile(
      new URL(
        '../../../../packages/openai/src/chat/__fixtures__/openai-audio-gpt-audio-1.5.json',
        import.meta.url,
      ),
      'utf8',
    ),
  );

  const openai = createOpenAI({
    apiKey: 'fixture-api-key',
    fetch: async () =>
      new Response(JSON.stringify(fixture), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
  });

  const result = await generateText({
    model: openai.chat('gpt-audio-1.5'),
    prompt: 'Say exactly: Fix the login bug',
  });

  const expectedTranscript = fixture.choices[0].message.audio.transcript;

  if (result.text !== expectedTranscript) {
    throw new Error(
      `${failureSignal} Expected ${JSON.stringify(expectedTranscript)}, received ${JSON.stringify(result.text)}.`,
    );
  }
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
