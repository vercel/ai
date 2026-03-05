import { cambai } from '@ai-sdk/cambai';
import { experimental_generateSpeech as generateSpeech } from 'ai';
import { saveAudioFile } from '../../lib/save-audio';
import { run } from '../../lib/run';

run(async () => {
  const result = await generateSpeech({
    model: cambai.speech('mars-instruct'),
    text: 'Hello from the AI SDK with Camb.ai!',
    voice: '147320',
    instructions: 'Speak in a cheerful and energetic tone',
  });

  console.log('Audio:', result.audio);
  console.log('Warnings:', result.warnings);

  await saveAudioFile(result.audio);
});
