import { assemblyai } from '@ai-sdk/assemblyai';
import { experimental_transcribe as transcribe } from 'ai';
import 'dotenv/config';
import { readFile } from 'fs/promises';

async function main() {
  const result = await transcribe({
    model: assemblyai.transcription('best'),
    audio: await readFile('data/galileo.mp3'),
    providerOptions: {
      assemblyai: {
        languageDetection: {
          codeSwitching: true,
          codeSwitchingConfidenceThreshold: 0.7,
        },
      },
    },
  });

  console.log('Text:', result.text);
  console.log('Duration:', result.durationInSeconds);
  console.log('Language:', result.responses[0].headers);
}

main().catch(console.error);
