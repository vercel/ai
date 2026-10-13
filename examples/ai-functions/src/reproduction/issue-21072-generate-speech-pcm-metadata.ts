import { createOpenAI } from '@ai-sdk/openai';
import { experimental_generateSpeech as generateSpeech } from 'ai';
import { MockSpeechModelV3 } from 'ai/test';

const pcm = new Uint8Array(480);

function wrapInWav(samples: Uint8Array): Uint8Array {
  const wav = new Uint8Array(44 + samples.length);
  const view = new DataView(wav.buffer);

  wav.set(new TextEncoder().encode('RIFF'), 0);
  view.setUint32(4, 36 + samples.length, true);
  wav.set(new TextEncoder().encode('WAVEfmt '), 8);
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, 24_000, true);
  view.setUint32(28, 48_000, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  wav.set(new TextEncoder().encode('data'), 36);
  view.setUint32(40, samples.length, true);
  wav.set(samples, 44);

  return wav;
}

function toBase64(data: Uint8Array): string {
  return Buffer.from(data).toString('base64');
}

function bytesEqual(actual: Uint8Array, expected: Uint8Array): boolean {
  return (
    actual.length === expected.length &&
    actual.every((byte, index) => byte === expected[index])
  );
}

type CaseResult = {
  label: string;
  expectedBytes: Uint8Array;
  expectedFormat: 'pcm' | 'wav';
  expectedMediaType: 'audio/pcm' | 'audio/wav';
  format: string;
  mediaType: string;
  bytes: Uint8Array;
  requestedFormat?: string;
};

async function runMockCase({
  label,
  audio,
  expectedBytes,
  expectedFormat,
  expectedMediaType,
}: {
  label: string;
  audio: Uint8Array | string;
  expectedBytes: Uint8Array;
  expectedFormat: CaseResult['expectedFormat'];
  expectedMediaType: CaseResult['expectedMediaType'];
}): Promise<CaseResult> {
  let requestedFormat: string | undefined;
  const { audio: result } = await generateSpeech({
    model: new MockSpeechModelV3({
      doGenerate: async ({ outputFormat }) => {
        requestedFormat = outputFormat;
        return {
          audio,
          warnings: [],
          response: {
            timestamp: new Date(0),
            modelId: 'synthetic-speech',
          },
        };
      },
    }),
    text: 'Synthetic greeting.',
    outputFormat: 'pcm',
  });

  return {
    label,
    expectedBytes,
    expectedFormat,
    expectedMediaType,
    format: result.format,
    mediaType: result.mediaType,
    bytes: result.uint8Array,
    requestedFormat,
  };
}

async function runOpenAICase({
  label,
  responseAudio,
  responseContentType,
  expectedFormat,
  expectedMediaType,
}: {
  label: string;
  responseAudio: Uint8Array;
  responseContentType: 'audio/pcm' | 'application/octet-stream';
  expectedFormat: CaseResult['expectedFormat'];
  expectedMediaType: CaseResult['expectedMediaType'];
}): Promise<CaseResult> {
  let requestedFormat: string | undefined;
  const openai = createOpenAI({
    apiKey: 'test-api-key',
    fetch: async (_input, init) => {
      const body = JSON.parse(String(init?.body)) as {
        response_format?: string;
      };
      requestedFormat = body.response_format;

      return new Response(responseAudio, {
        status: 200,
        headers: { 'content-type': responseContentType },
      });
    },
  });

  const { audio } = await generateSpeech({
    model: openai.speech('tts-1'),
    text: 'Synthetic greeting.',
    outputFormat: 'pcm',
  });

  return {
    label,
    expectedBytes: responseAudio,
    expectedFormat,
    expectedMediaType,
    format: audio.format,
    mediaType: audio.mediaType,
    bytes: audio.uint8Array,
    requestedFormat,
  };
}

async function main() {
  const wav = wrapInWav(pcm);
  const results = await Promise.all([
    runMockCase({
      label: 'mock Uint8Array raw PCM',
      audio: pcm,
      expectedBytes: pcm,
      expectedFormat: 'pcm',
      expectedMediaType: 'audio/pcm',
    }),
    runMockCase({
      label: 'mock base64 raw PCM',
      audio: toBase64(pcm),
      expectedBytes: pcm,
      expectedFormat: 'pcm',
      expectedMediaType: 'audio/pcm',
    }),
    runOpenAICase({
      label: 'OpenAI raw PCM with audio/pcm response',
      responseAudio: pcm,
      responseContentType: 'audio/pcm',
      expectedFormat: 'pcm',
      expectedMediaType: 'audio/pcm',
    }),
    runOpenAICase({
      label: 'OpenAI raw PCM with application/octet-stream response',
      responseAudio: pcm,
      responseContentType: 'application/octet-stream',
      expectedFormat: 'pcm',
      expectedMediaType: 'audio/pcm',
    }),
    runMockCase({
      label: 'mock Uint8Array WAV control',
      audio: wav,
      expectedBytes: wav,
      expectedFormat: 'wav',
      expectedMediaType: 'audio/wav',
    }),
    runMockCase({
      label: 'mock base64 WAV control',
      audio: toBase64(wav),
      expectedBytes: wav,
      expectedFormat: 'wav',
      expectedMediaType: 'audio/wav',
    }),
    runOpenAICase({
      label: 'OpenAI WAV control with audio/pcm response',
      responseAudio: wav,
      responseContentType: 'audio/pcm',
      expectedFormat: 'wav',
      expectedMediaType: 'audio/wav',
    }),
    runOpenAICase({
      label: 'OpenAI WAV control with application/octet-stream response',
      responseAudio: wav,
      responseContentType: 'application/octet-stream',
      expectedFormat: 'wav',
      expectedMediaType: 'audio/wav',
    }),
  ]);

  for (const result of results) {
    if (!bytesEqual(result.bytes, result.expectedBytes)) {
      throw new Error(`${result.label}: generated audio bytes changed`);
    }
    if (result.requestedFormat !== 'pcm') {
      throw new Error(
        `${result.label}: provider received ${String(result.requestedFormat)} instead of pcm`,
      );
    }
  }

  const controls = results.filter(result => result.expectedFormat === 'wav');
  for (const control of controls) {
    if (
      control.format !== control.expectedFormat ||
      control.mediaType !== control.expectedMediaType
    ) {
      throw new Error(
        `${control.label}: WAV control was labeled ${control.format}/${control.mediaType}`,
      );
    }
  }

  const rawPcmResults = results.filter(
    result => result.expectedFormat === 'pcm',
  );
  const failures = rawPcmResults.filter(
    result =>
      result.format !== result.expectedFormat ||
      result.mediaType !== result.expectedMediaType,
  );

  for (const result of results) {
    console.log(
      `${result.label}: requested=${result.requestedFormat}, returned=${result.format}/${result.mediaType}, bytes=${result.bytes.length}`,
    );
  }

  if (failures.length > 0) {
    console.error(
      'ISSUE #21072 REPRODUCED: raw PCM output was labeled as MP3 metadata',
    );
    process.exitCode = 1;
    return;
  }

  console.log('Raw PCM metadata is correct in every reproduction path.');
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
