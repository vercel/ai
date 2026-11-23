import { elevenLabs } from '@ai-sdk/elevenlabs';
import { generateSpeech } from 'ai';
import { run } from '../../lib/run';
import { saveAudioFile } from '../../lib/save-audio';

run(async () => {
  // Use eleven_multilingual_v2 to exercise the Text to Speech timestamp endpoint.
  // Eleven v4 automatically uses Text to Dialogue with one text/voice input.
  const result = await generateSpeech({
    model: elevenLabs.speech(process.argv[2] ?? 'eleven_v4'),
    text: 'Hello from the AI SDK with timestamps!',
    voice: process.env.ELEVENLABS_VOICE_ID ?? 'JBFqnCBsd6RMkjVDRZzb',
    providerOptions: {
      elevenlabs: { withTimestamps: true },
    },
  });

  console.log('Timestamps:', result.providerMetadata?.elevenlabs);
  console.log('Warnings:', result.warnings);
  await saveAudioFile(result.audio);
});
