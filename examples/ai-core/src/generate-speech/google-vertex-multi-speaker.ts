import { vertex } from '@ai-sdk/google-vertex';
import { GoogleVertexSpeechProviderOptions } from '@ai-sdk/google-vertex';
import { experimental_generateSpeech as generateSpeech } from 'ai';
import 'dotenv/config';
import { saveAudioFile } from '../lib/save-audio';

async function main() {
  const result = await generateSpeech({
    model: vertex.speech('gemini-2.5-flash-tts'),
    text: 'ignored when using multiSpeakerMarkup',
    providerOptions: {
      google: {
        multiSpeakerMarkup: {
          turns: [
            {
              speaker: 'Alice',
              text: 'Hi Bob, how are you doing today?',
            },
            {
              speaker: 'Bob',
              text: 'I am doing well, thanks for asking!',
            },
            {
              speaker: 'Alice',
              text: 'That is great to hear!',
            },
          ],
        },
        multiSpeakerVoiceConfig: {
          speakerVoiceConfigs: [
            {
              speakerAlias: 'Alice',
              speakerId: 'Kore',
            },
            {
              speakerAlias: 'Bob',
              speakerId: 'Charon',
            },
          ],
        },
      } satisfies GoogleVertexSpeechProviderOptions,
    },
  });

  console.log('Audio:', result.audio);
  console.log('Warnings:', result.warnings);
  console.log('Responses:', result.responses);
  console.log('Provider Metadata:', result.providerMetadata);

  await saveAudioFile(result.audio);
}

main().catch(console.error);
