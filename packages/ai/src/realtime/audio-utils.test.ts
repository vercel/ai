import { describe, expect, it } from 'vitest';
import { resampleAudio, StreamingAudioResampler } from './audio-utils';

describe('StreamingAudioResampler', () => {
  it.each([
    {
      name: '44.1 kHz to 24 kHz',
      inputRate: 44_100,
      outputRate: 24_000,
      chunkSize: 1_024,
    },
    {
      name: '48 kHz to 24 kHz',
      inputRate: 48_000,
      outputRate: 24_000,
      chunkSize: 1_023,
    },
    {
      name: '24 kHz to 44.1 kHz',
      inputRate: 24_000,
      outputRate: 44_100,
      chunkSize: 1_024,
    },
  ])(
    'produces partition-independent output for $name',
    ({ inputRate, outputRate, chunkSize }) => {
      const input = new Float32Array(chunkSize * 100);
      for (let index = 0; index < input.length; index++) {
        input[index] = Math.sin((2 * Math.PI * 440 * index) / inputRate);
      }

      const expected = resampleAudio(input, inputRate, outputRate);
      const resampler = new StreamingAudioResampler(inputRate, outputRate);
      const chunks: Float32Array[] = [];
      let outputLength = 0;

      for (let offset = 0; offset < input.length; offset += chunkSize) {
        const chunk = resampler.process(
          input.subarray(offset, offset + chunkSize),
        );
        chunks.push(chunk);
        outputLength += chunk.length;
      }
      const finalChunk = resampler.finish();
      chunks.push(finalChunk);
      outputLength += finalChunk.length;

      const actual = new Float32Array(outputLength);
      let outputOffset = 0;
      for (const chunk of chunks) {
        actual.set(chunk, outputOffset);
        outputOffset += chunk.length;
      }

      expect(actual.length).toBe(expected.length);
      let maximumDifference = 0;
      for (let index = 0; index < actual.length; index++) {
        maximumDifference = Math.max(
          maximumDifference,
          Math.abs(actual[index] - expected[index]),
        );
      }
      expect(maximumDifference).toBeLessThan(0.000_001);
    },
  );

  it('defers output until a short downsampling input has enough duration', () => {
    const resampler = new StreamingAudioResampler(48_000, 16_000);

    expect(resampler.process(new Float32Array([0.25]))).toHaveLength(0);
    expect(resampler.process(new Float32Array([0.5]))).toEqual(
      new Float32Array([0.25]),
    );
    expect(resampler.finish()).toHaveLength(0);
  });
});
