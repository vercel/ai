import { describe, expect, it } from 'vitest';
import { resampleAudio } from './audio-utils';

function createTone({
  frequency,
  sampleRate,
  durationSeconds = 1,
}: {
  frequency: number;
  sampleRate: number;
  durationSeconds?: number;
}): Float32Array {
  return Float32Array.from(
    { length: sampleRate * durationSeconds },
    (_, index) => Math.sin((2 * Math.PI * frequency * index) / sampleRate),
  );
}

function rms(samples: Float32Array): number {
  return Math.sqrt(
    samples.reduce((sum, sample) => sum + sample * sample, 0) / samples.length,
  );
}

describe('resampleAudio', () => {
  it('returns the input when the sample rate is unchanged', () => {
    const input = new Float32Array([0.25, -0.5, 0.75]);

    expect(resampleAudio(input, 24_000, 24_000)).toBe(input);
  });

  it('suppresses frequencies above the output Nyquist frequency when downsampling', () => {
    const inputRate = 48_000;
    const outputRate = 24_000;
    const transientSamples = 1_024;

    const passband = resampleAudio(
      createTone({ frequency: 1_000, sampleRate: inputRate }),
      inputRate,
      outputRate,
    ).subarray(transientSamples, outputRate - transientSamples);
    const stopband = resampleAudio(
      createTone({ frequency: 16_000, sampleRate: inputRate }),
      inputRate,
      outputRate,
    ).subarray(transientSamples, outputRate - transientSamples);

    const passbandGainDb = 20 * Math.log10(rms(passband) / Math.SQRT1_2);
    const stopbandAttenuationDb =
      20 * Math.log10(rms(stopband) / rms(passband));

    expect(Math.abs(passbandGainDb)).toBeLessThanOrEqual(1);
    expect(stopbandAttenuationDb).toBeLessThanOrEqual(-40);
  });

  it('filters non-integer downsampling ratios', () => {
    const inputRate = 48_000;
    const outputRate = 32_000;
    const transientSamples = 1_024;

    const output = resampleAudio(
      createTone({ frequency: 20_000, sampleRate: inputRate }),
      inputRate,
      outputRate,
    ).subarray(transientSamples, outputRate - transientSamples);

    expect(20 * Math.log10(rms(output) / Math.SQRT1_2)).toBeLessThanOrEqual(
      -40,
    );
  });

  it('handles input shorter than the low-pass filter', () => {
    expect(resampleAudio(new Float32Array([0.25]), 48_000, 24_000)).toEqual(
      new Float32Array([0.25]),
    );
  });
});
