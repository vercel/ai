import {
  elevenLabs,
  type ElevenLabsSpeechModelOptions,
} from '@ai-sdk/elevenlabs';
import { generateSpeech } from 'ai';
import { saveAudioFile } from '../../lib/save-audio';
import { run } from '../../lib/run';

run(async () => {
  const result = await generateSpeech({
    model: elevenLabs.speech('eleven_v3'),
    text: '',
    providerOptions: {
      elevenlabs: {
        inputs: [
          { text: '[giggling] Knock knock', voiceId: 'JBFqnCBsd6RMkjVDRZzb' },
          { text: '[curious] Who is there?', voiceId: 'Aw4FAjKCGjjNkVhN1Xmq' },
        ],
      } satisfies ElevenLabsSpeechModelOptions,
    },
  });

  console.log('Warnings:', result.warnings);
  console.log('Provider Metadata:', result.providerMetadata);

  await saveAudioFile(result.audio);
});
