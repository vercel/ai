import { nebul } from '@ai-sdk/nebul';
import { generateSpeech } from 'ai';
import { saveAudioFile } from '../../lib/save-audio';
import { run } from '../../lib/run';

run(async () => {
  const result = await generateSpeech({
    model: nebul.speechModel('hexgrad/Kokoro-82M'),
    text: 'Hello from the AI SDK!',
  });

  console.log('Audio:', result.audio);
  console.log('Warnings:', result.warnings);

  await saveAudioFile(result.audio);
});
