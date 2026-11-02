import {
  elevenLabs,
  type ElevenLabsSpeechModelOptions,
} from '@ai-sdk/elevenlabs';
import { generateSpeech } from 'ai';
import { saveAudioFile } from '../../lib/save-audio';
import { run } from '../../lib/run';

run(async () => {
  const result = await generateSpeech({
    model: elevenLabs.speech('eleven_text_to_sound_v2'),
    text: 'Glass shattering on a concrete floor',
    providerOptions: {
      elevenlabs: {
        durationSeconds: 2,
        promptInfluence: 0.5,
      } satisfies ElevenLabsSpeechModelOptions,
    },
  });

  console.log('Warnings:', result.warnings);
  console.log('Provider Metadata:', result.providerMetadata);

  await saveAudioFile(result.audio);
});
