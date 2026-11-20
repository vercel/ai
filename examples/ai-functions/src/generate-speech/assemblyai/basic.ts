import { assemblyai } from '@ai-sdk/assemblyai';
import { experimental_generateSpeech as generateSpeech } from 'ai';
import { saveAudioFile } from '../../lib/save-audio';
import { run } from '../../lib/run';

run(async () => {
  const result = await generateSpeech({
    model: assemblyai.speech('assemblyai-tts-1'),
    text: 'Hello from AssemblyAI! This is a test of the text-to-speech API.',
    voice: 'aai-kyla',
  });

  console.log('Audio:', result.audio);
  console.log('Warnings:', result.warnings);
  console.log('Responses:', result.responses);
  console.log('Provider Metadata:', result.providerMetadata);

  await saveAudioFile(result.audio);
});
