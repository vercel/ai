import type {
  Experimental_TranscriptionModelV4StreamPart as TranscriptionModelV4StreamPart,
  SpeechModelV4,
  TranscriptionModelV4,
} from '@ai-sdk/provider';
import {
  experimental_streamTranscribe as streamTranscribe,
  generateSpeech,
  registerTelemetry,
  transcribe,
} from 'ai';
import { run } from '../../lib/run';
import { consoleTelemetry } from './console-telemetry';

registerTelemetry(consoleTelemetry);

const speechModel: SpeechModelV4 = {
  specificationVersion: 'v4',
  provider: 'example',
  modelId: 'example-speech',
  async doGenerate({ text }) {
    return {
      audio: new Uint8Array([1, 2, 3, 4]),
      warnings: [],
      response: {
        timestamp: new Date(),
        modelId: 'example-speech',
      },
      usage: { characters: text.length },
      providerMetadata: {
        example: { requestId: 'speech-request' },
      },
    };
  },
};

const transcriptionModel: TranscriptionModelV4 = {
  specificationVersion: 'v4',
  provider: 'example',
  modelId: 'example-transcription',
  async doGenerate() {
    return {
      text: 'Hello from AI SDK speech telemetry.',
      segments: [],
      language: 'en',
      durationInSeconds: 1,
      warnings: [],
      response: {
        timestamp: new Date(),
        modelId: 'example-transcription',
      },
      usage: { inputAudioSeconds: 1 },
      providerMetadata: {
        example: { requestId: 'transcription-request' },
      },
    };
  },
  async doStream({ audio }) {
    const reader = audio.getReader();
    while (!(await reader.read()).done) {
      // Consume the input like a streaming provider.
    }

    const parts: TranscriptionModelV4StreamPart[] = [
      { type: 'stream-start', warnings: [] },
      {
        type: 'transcript-delta',
        delta: 'Hello from streaming telemetry.',
      },
      {
        type: 'finish',
        text: 'Hello from streaming telemetry.',
        segments: [],
        language: 'en',
        durationInSeconds: 1,
        usage: { inputAudioSeconds: 1 },
      },
    ];

    return {
      stream: new ReadableStream<TranscriptionModelV4StreamPart>({
        start(controller) {
          for (const part of parts) {
            controller.enqueue(part);
          }
          controller.close();
        },
      }),
    };
  },
};

run(async () => {
  const speech = await generateSpeech({
    model: speechModel,
    text: 'Hello from AI SDK speech telemetry.',
    voice: 'alloy',
    telemetry: {
      functionId: 'generate-greeting',
    },
  });

  const transcript = await transcribe({
    model: transcriptionModel,
    audio: speech.audio.uint8Array,
    telemetry: {
      functionId: 'transcribe-greeting',
    },
  });
  console.log('Transcript:', transcript.text);

  const streamingSpeech = await generateSpeech({
    model: speechModel,
    text: 'Streaming transcription telemetry includes the consumed byte count.',
    voice: 'alloy',
    outputFormat: 'pcm',
    telemetry: {
      functionId: 'generate-streaming-audio',
    },
  });

  const bytes = streamingSpeech.audio.uint8Array;
  const audio = new ReadableStream<Uint8Array>({
    start(controller) {
      for (let offset = 0; offset < bytes.length; offset += 16 * 1024) {
        controller.enqueue(bytes.slice(offset, offset + 16 * 1024));
      }
      controller.close();
    },
  });

  const streamingTranscript = streamTranscribe({
    model: transcriptionModel,
    audio,
    inputAudioFormat: { type: 'audio/pcm', rate: 24000 },
    telemetry: {
      functionId: 'stream-transcribe-greeting',
    },
  });

  for await (const part of streamingTranscript.fullStream) {
    if (part.type === 'transcript-delta') {
      process.stdout.write(part.delta);
    }
  }
  console.log();
});
