import { google } from '@ai-sdk/google';
import { generateText } from 'ai';
import 'dotenv/config';

async function main() {
  const result = await generateText({
<<<<<<< HEAD
    model: google('gemini-1.5-flash-002'),
=======
    model: google('gemini-3-pro-preview'),
>>>>>>> 599a97f5b (fix: update gemini 3 model id (#10339))
    prompt: 'Invent a new holiday and describe its traditions.',
  });

  const googleMetadata = result.providerMetadata?.google;

  console.log(result.text);
  console.log();
  console.log('Token usage:', result.usage);
  console.log('Finish reason:', result.finishReason);
  console.log('Safety info:', {
    promptFeedback: googleMetadata?.promptFeedback,
    safetyRatings: googleMetadata?.safetyRatings,
  });
}

main().catch(console.error);
