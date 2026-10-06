import { gradium } from '@gradium/ai-sdk';
import { generateSpeech } from 'ai';
import { saveAudioFile } from '../../lib/save-audio';
import { run } from '../../lib/run';

run(async () => {
  const result = await generateSpeech({
    model: gradium.speech('default'),
    text: 'Hello from the AI SDK with Gradium!',
    voice: process.env.GRADIUM_VOICE_ID ?? 'YTpq7expH9539ERJ',
    outputFormat: 'wav',
  });
  console.log('Provider metadata:', result.providerMetadata);
  await saveAudioFile(result.audio);
});
