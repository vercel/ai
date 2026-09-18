import { createOpenAI } from '@ai-sdk/openai';
import { strict as assert } from 'node:assert';
import { generateSpeech } from 'ai';
import { MockSpeechModelV4 } from 'ai/test';

type AudioMetadata = {
  label: string;
  format: string;
  mediaType: string;
  byteCount: number;
};

const pcm = new Uint8Array(480);
const wav = addWavHeader(pcm, 24000);

async function generateWithMock({
  label,
  audio,
}: {
  label: string;
  audio: Uint8Array | string;
}): Promise<AudioMetadata> {
  let requestedFormat: string | undefined;

  const { audio: generatedAudio } = await generateSpeech({
    model: new MockSpeechModelV4({
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

  assert.equal(
    requestedFormat,
    'pcm',
    `${label}: generateSpeech did not pass the requested PCM format to the model`,
  );

  return {
    label,
    format: generatedAudio.format,
    mediaType: generatedAudio.mediaType,
    byteCount: generatedAudio.uint8Array.length,
  };
}

async function generateWithOpenAI({
  label,
  audio,
  responseContentType,
}: {
  label: string;
  audio: Uint8Array;
  responseContentType: string;
}): Promise<AudioMetadata> {
  let requestBody: unknown;

  const openai = createOpenAI({
    apiKey: 'test-api-key',
    baseURL: 'https://example.test/v1',
    fetch: async (_input, init) => {
      requestBody = JSON.parse(String(init?.body));
      return new Response(Buffer.from(audio), {
        headers: { 'content-type': responseContentType },
      });
    },
  });

  const { audio: generatedAudio } = await generateSpeech({
    model: openai.speech('tts-1'),
    text: 'Synthetic greeting.',
    outputFormat: 'pcm',
  });

  assert.equal(
    (requestBody as { response_format?: string }).response_format,
    'pcm',
    `${label}: the OpenAI provider did not request PCM`,
  );

  return {
    label,
    format: generatedAudio.format,
    mediaType: generatedAudio.mediaType,
    byteCount: generatedAudio.uint8Array.length,
  };
}

async function main() {
  const pcmBase64 = Buffer.from(pcm).toString('base64');
  const wavBase64 = Buffer.from(wav).toString('base64');

  const pcmResults = await Promise.all([
    generateWithMock({
      label: 'mock Uint8Array PCM',
      audio: pcm,
    }),
    generateWithMock({
      label: 'mock base64 PCM',
      audio: pcmBase64,
    }),
    generateWithOpenAI({
      label: 'OpenAI PCM with audio/pcm response',
      audio: pcm,
      responseContentType: 'audio/pcm',
    }),
    generateWithOpenAI({
      label: 'OpenAI PCM with application/octet-stream response',
      audio: pcm,
      responseContentType: 'application/octet-stream',
    }),
  ]);

  const wavControlResults = await Promise.all([
    generateWithMock({
      label: 'mock Uint8Array WAV control',
      audio: wav,
    }),
    generateWithMock({
      label: 'mock base64 WAV control',
      audio: wavBase64,
    }),
    generateWithOpenAI({
      label: 'OpenAI WAV control with audio/pcm response',
      audio: wav,
      responseContentType: 'audio/pcm',
    }),
    generateWithOpenAI({
      label: 'OpenAI WAV control with application/octet-stream response',
      audio: wav,
      responseContentType: 'application/octet-stream',
    }),
  ]);

  console.table([...pcmResults, ...wavControlResults]);

  for (const result of pcmResults) {
    assert.equal(
      result.byteCount,
      pcm.length,
      `${result.label}: PCM bytes were not preserved`,
    );
  }

  assert.deepEqual(
    wavControlResults.map(({ format, mediaType, byteCount }) => ({
      format,
      mediaType,
      byteCount,
    })),
    Array.from({ length: 4 }, () => ({
      format: 'wav',
      mediaType: 'audio/wav',
      byteCount: wav.length,
    })),
    'WAV controls must remain identifiable from their container headers',
  );

  assert.deepEqual(
    pcmResults.map(({ format, mediaType }) => ({ format, mediaType })),
    Array.from({ length: 4 }, () => ({
      format: 'pcm',
      mediaType: 'audio/pcm',
    })),
    'ISSUE #21072: raw PCM output metadata is inconsistent with the returned PCM bytes',
  );
}

function addWavHeader(samples: Uint8Array, sampleRate: number): Uint8Array {
  const headerSize = 44;
  const output = new Uint8Array(headerSize + samples.length);
  const view = new DataView(output.buffer);

  writeAscii(output, 0, 'RIFF');
  view.setUint32(4, 36 + samples.length, true);
  writeAscii(output, 8, 'WAVE');
  writeAscii(output, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeAscii(output, 36, 'data');
  view.setUint32(40, samples.length, true);
  output.set(samples, headerSize);

  return output;
}

function writeAscii(target: Uint8Array, offset: number, value: string) {
  for (let index = 0; index < value.length; index++) {
    target[offset + index] = value.charCodeAt(index);
  }
}

main();
