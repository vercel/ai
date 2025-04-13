import { groq } from '@ai-sdk/groq';
import { experimental_transcribe as transcribe } from 'ai';
import 'dotenv/config';

async function main() {
  const result = await transcribe({
    model: groq.transcription('whisper-large-v3-turbo'),
    audio: new URL(
      'https://github.com/vercel/ai/raw/refs/heads/main/examples/ai-core/data/galileo.mp3',
    ),
  });

  console.log('Text:', result.text);
  console.log('Duration:', result.durationInSeconds);
  console.log('Language:', result.language);
  console.log('Segments:', result.segments);
  console.log('Warnings:', result.warnings);
  console.log('Responses:', result.responses);
}

main().catch(console.error);
