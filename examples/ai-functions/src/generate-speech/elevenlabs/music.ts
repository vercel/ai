import {
  elevenLabs,
  type ElevenLabsSpeechModelOptions,
} from '@ai-sdk/elevenlabs';
import { generateSpeech } from 'ai';
import { saveAudioFile } from '../../lib/save-audio';
import { run } from '../../lib/run';

run(async () => {
  const result = await generateSpeech({
    model: elevenLabs.speech('music_v2_5'),
    text: 'An upbeat synthwave intro with driving bass',
    providerOptions: {
      elevenlabs: {
        musicLengthMs: 10000,
        forceInstrumental: true,
      } satisfies ElevenLabsSpeechModelOptions,
    },
  });

  console.log('Warnings:', result.warnings);
  console.log('Provider Metadata:', result.providerMetadata);

  await saveAudioFile(result.audio);
});
