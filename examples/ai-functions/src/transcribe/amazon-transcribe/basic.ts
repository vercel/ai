import { amazonTranscribe } from '@ai-sdk/amazon-transcribe';
import { transcribe } from 'ai';
import { readFile } from 'fs/promises';
import { run } from '../../lib/run';

run(async () => {
  const result = await transcribe({
    model: amazonTranscribe.transcription(),
    audio: await readFile('data/galileo.mp3'),
    providerOptions: {
      amazonTranscribe: {
        // S3 bucket the audio is uploaded to and read from by Amazon Transcribe.
        inputBucket: process.env.AWS_TRANSCRIBE_INPUT_BUCKET!,
        languageCode: 'en-US',
      },
    },
  });

  console.log('Text:', result.text);
  console.log('Duration:', result.durationInSeconds);
  console.log('Language:', result.language);
  console.log('Segments:', result.segments);
  console.log('Warnings:', result.warnings);
});
