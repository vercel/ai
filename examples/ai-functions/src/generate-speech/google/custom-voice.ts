import { google } from '@ai-sdk/google';
import { generateSpeech } from 'ai';
import { run } from '../../lib/run';
import { saveAudioFile } from '../../lib/save-audio';

run(async () => {
  const voices = google.voices();
  const voice = await voices.create({
    store: true,
    voice: {
      type: 'prompted',
      displayName: 'Storyteller',
      prompted: {
        input: 'A warm, calm storyteller with a soft British accent.',
      },
    },
  });

  if (voice.id == null) {
    throw new Error('Google did not return a stored voice ID.');
  }

  try {
    const result = await generateSpeech({
      model: google.speech('gemini-3.8-flash-tts'),
      voice: voice.id,
      text: 'Once upon a time, a small fox discovered a hidden garden.',
    });

    await saveAudioFile(result.audio);
  } finally {
    // This example creates a temporary voice; applications can retain its ID.
    await voices.delete({ id: voice.id });
  }
});
