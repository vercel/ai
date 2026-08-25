import { createMoonshotAI } from '@ai-sdk/moonshotai';
import { generateText } from 'ai';

async function main() {
  const moonshotai = createMoonshotAI();

  try {
    const result = await generateText({
      model: moonshotai('kimi-k3'),
      prompt: 'Reply with exactly OK',
      temperature: 0.5,
      maxOutputTokens: 1,
    });

    if (result.text.length === 0) {
      throw new Error('Moonshot returned no text.');
    }

    console.log('Moonshot request succeeded:', result.text);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    if (message.includes('invalid temperature: only 1 is allowed')) {
      console.error(
        'ISSUE #19542 REPRODUCED: @ai-sdk/moonshotai forwarded temperature=0.5 to kimi-k3, so Moonshot rejected an otherwise valid generation request.',
      );
      process.exitCode = 1;
      return;
    }

    throw error;
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
