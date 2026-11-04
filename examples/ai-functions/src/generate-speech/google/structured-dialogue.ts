import { google, type GoogleSpeechModelOptions } from '@ai-sdk/google';
import { generateSpeech } from 'ai';
import { run } from '../../lib/run';
import { saveAudioFile } from '../../lib/save-audio';

run(async () => {
  const result = await generateSpeech({
    model: google.speech('gemini-3.8-flash-lite-tts'),
    text: '', // The structured turns supply the transcript.
    providerOptions: {
      google: {
        multiSpeakerVoiceConfig: {
          speakerVoiceConfigs: [
            {
              speaker: 'Joe',
              voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } },
            },
            {
              speaker: 'Jane',
              voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Puck' } },
            },
          ],
        },
        turns: [
          {
            text: 'Did you hear that?',
            speechMetadata: { speaker: 'Joe', style: 'whispering' },
          },
          {
            text: '<sigh> It was just the wind.',
            speechMetadata: { speaker: 'Jane', style: 'relieved' },
          },
        ],
      } satisfies GoogleSpeechModelOptions,
    },
  });

  await saveAudioFile(result.audio);
});
