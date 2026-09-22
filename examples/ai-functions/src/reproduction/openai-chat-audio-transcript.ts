import { createOpenAI } from '@ai-sdk/openai';
import { generateText } from 'ai';
import { readFile } from 'node:fs/promises';

type AudioFixture = {
  choices: Array<{
    message: {
      audio?: {
        transcript?: string;
      };
    };
  }>;
};

async function main() {
  const fixtureUrl = new URL(
    '../../../../packages/openai/src/chat/__fixtures__/openai-audio-gpt-audio-1.5.json',
    import.meta.url,
  );
  const fixture = JSON.parse(
    await readFile(fixtureUrl, 'utf8'),
  ) as AudioFixture;
  const transcript = fixture.choices[0]?.message.audio?.transcript;

  if (transcript == null || transcript.length === 0) {
    throw new Error('Recorded OpenAI fixture has no audio transcript.');
  }

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
    prompt: 'Say exactly these words and nothing else: Fix the login bug',
  });

  if (result.text !== transcript) {
    console.error(
      'ISSUE #21289 REPRODUCED: message.audio.transcript was not exposed as text content',
    );
    console.error(`Expected transcript: ${JSON.stringify(transcript)}`);
    console.error(`Received text: ${JSON.stringify(result.text)}`);
    process.exitCode = 1;
    return;
  }

  console.log('OpenAI audio transcript was exposed as text content.');
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
