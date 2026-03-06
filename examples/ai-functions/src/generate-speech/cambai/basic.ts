import { cambai } from '@ai-sdk/cambai';
import { experimental_generateSpeech as generateSpeech } from 'ai';
import { saveAudioFile } from '../../lib/save-audio';
import { run } from '../../lib/run';

run(async () => {
  const result = await generateSpeech({
    model: cambai.speech('mars-pro'),
    text: 'Hello from the AI SDK with Camb.ai!',
    voice: '147320',
  });

  console.log('Audio:', result.audio);
  console.log('Warnings:', result.warnings);
  console.log('Responses:', result.responses);
  console.log('Provider Metadata:', result.providerMetadata);

  await saveAudioFile(result.audio);
});
