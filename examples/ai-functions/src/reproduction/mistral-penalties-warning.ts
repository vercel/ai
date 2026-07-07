import { mistral } from '@ai-sdk/mistral';
import { generateText } from 'ai';

async function main() {
  const result = await generateText({
    model: mistral('mistral-small-latest'),
    prompt: 'Reply with exactly OK.',
    maxOutputTokens: 8,
    presencePenalty: 0.1,
    frequencyPenalty: 0.2,
  });

  console.log(
    JSON.stringify(
      {
        text: result.text,
        warnings: result.warnings,
      },
      null,
      2,
    ),
  );
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
