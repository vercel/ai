import { bedrockAnthropic } from '@ai-sdk/amazon-bedrock/anthropic';
import { streamText } from 'ai';
import { run } from '../lib/run';

// Known corrupted forms from the bug report (UTF-8 bytes misread as Latin-1)
// German: ö→Ã¶, ü→Ã¼, é→Ã©, ß→ÃŸ
// Japanese: 日→æ¥, 本→æ¬, で→ã§
const corruptionPattern = /Ã¶|Ã¼|Ã©|ÃŸ|æ¥æ¬|ã§|ä¸ç/;

let testNumber = 0;

async function testStream(label: string, prompt: string) {
  testNumber++;
  console.log(`--- ${label} ---`);
  const result = streamText({
    model: bedrockAnthropic('us.anthropic.claude-haiku-4-5-20251001-v1:0'),
    prompt,
  });

  let fullText = '';
  for await (const textPart of result.textStream) {
    process.stdout.write(textPart);
    fullText += textPart;
  }

  console.log();
  console.log();

  if (corruptionPattern.test(fullText)) {
    console.log(
      `\x1b[34mFAIL test ${testNumber}: detected corrupted UTF-8 characters\x1b[0m`,
    );
  } else {
    console.log(
      `\x1b[34mPASS test ${testNumber}: no corrupted characters detected\x1b[0m`,
    );
  }
  console.log();
}

run(async () => {
  await testStream(
    'German',
    'Gib mir eine Liste der größten Städte in Deutschland!',
  );
  await testStream(
    'Japanese',
    '日本で一番大きい都市のリストを教えてください！',
  );
});
