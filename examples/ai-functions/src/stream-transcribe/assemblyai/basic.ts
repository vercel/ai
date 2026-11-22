import { assemblyai } from '@ai-sdk/assemblyai';
import {
  experimental_streamTranscribe as streamTranscribe,
  generateSpeech,
} from 'ai';
import { setTimeout as delay } from 'node:timers/promises';
import { run } from '../../lib/run';

run(async () => {
  // Synthesize 16 kHz PCM test audio with AssemblyAI text-to-speech.
  const speech = await generateSpeech({
    model: assemblyai.speech('assemblyai-tts-1'),
    text: 'Hello from the AI SDK! AssemblyAI can transcribe live audio as it arrives. My account number is 4 8 1 5 1 6 2 3.',
    voice: 'aai-kyla',
    outputFormat: 'pcm',
    providerOptions: { assemblyai: { sampleRate: 16000 } },
  });

  const bytes = speech.audio.uint8Array;
  // 100 ms of 16 kHz, 16-bit mono PCM, paced like microphone input.
  const chunkSize = 3200;
  let offset = 0;
  const audio = new ReadableStream<Uint8Array>({
    async pull(controller) {
      if (offset >= bytes.length) {
        controller.close();
        return;
      }
      controller.enqueue(bytes.slice(offset, offset + chunkSize));
      offset += chunkSize;
      await delay(100);
    },
  });

  const result = streamTranscribe({
    model: assemblyai.transcription('assemblyai-stt-3-7-realtime'),
    audio,
    inputAudioFormat: { type: 'audio/pcm', rate: 16000 },
    providerOptions: {
      assemblyai: { keytermsPrompt: ['AI SDK', 'AssemblyAI'] },
    },
    abortSignal: AbortSignal.timeout(60000),
  });

  for await (const part of result.fullStream) {
    if (part.type === 'error') throw part.error;
    if (
      part.type === 'transcript-partial' ||
      part.type === 'transcript-final'
    ) {
      console.log(part.type, part.text);
    }
  }

  console.log('Text:', await result.text);
  console.log('Duration:', await result.durationInSeconds);
  console.log('Warnings:', await result.warnings);
});
