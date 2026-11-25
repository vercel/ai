import { elevenLabs } from '@ai-sdk/elevenlabs';
import { generateSpeech } from 'ai';
import { run } from '../../lib/run';
import { saveAudioFile } from '../../lib/save-audio';

run(async () => {
  const result = await generateSpeech({
    model: elevenLabs.speech('music_v2_5'),
    text: '',
    providerOptions: {
      elevenlabs: {
        withTimestamps: true,
        compositionPlan: {
          chunks: [
            {
              text: '[Verse]\nHello world, hello world',
              duration_ms: 3000,
              positive_styles: [
                'pop',
                'clear solo vocals',
                'slow tempo',
                'bright piano',
                'gentle drums',
                'simple melody',
              ],
            },
          ],
        },
      },
    },
  });

  console.log(
    'Lyric timestamps:',
    result.providerMetadata?.elevenlabs?.wordTimestamps,
  );
  await saveAudioFile(result.audio);
});
