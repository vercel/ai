import { google } from '@ai-sdk/google';
import { experimental_generateSpeech as generateSpeech } from 'ai';
import { saveAudioFile } from '../lib/save-audio';
import { run } from '../lib/run';

run(async () => {
  const result = await generateSpeech({
    model: google.speech('gemini-2.5-flash-preview-tts'),
    text: '[Alice] Hello, how are you today? [Bob] I am doing great, thanks for asking!',
    providerOptions: {
      google: {
        multiSpeakerVoiceConfig: {
          speakerVoiceConfigs: [
            {
              speaker: 'Alice',
              voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } },
            },
            {
              speaker: 'Bob',
              voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Puck' } },
            },
          ],
        },
      },
    },
  });

  console.log('Audio:', result.audio);
  console.log('Warnings:', result.warnings);
  console.log('Responses:', result.responses);
  console.log('Provider Metadata:', result.providerMetadata);

  await saveAudioFile(result.audio);
});
