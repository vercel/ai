import assert from 'node:assert/strict';
import { experimental_resampleAudio as resampleAudio } from 'ai';

const inputRate = 48_000;
const outputRate = 24_000;
const durationSeconds = 1;
const transientSamples = 1_024;
const passbandFrequency = 1_000;
const stopbandFrequency = 16_000;
const aliasFrequency = 8_000;
const maximumPassbandGainErrorDb = 1;
const requiredStopbandAttenuationDb = -40;

class ReproducedBugError extends Error {}

function rms(samples: Float32Array): number {
  return Math.sqrt(
    samples.reduce((sum, sample) => sum + sample * sample, 0) / samples.length,
  );
}

function createTone(frequency: number): Float32Array {
  return Float32Array.from(
    { length: inputRate * durationSeconds },
    (_, index) => Math.sin((2 * Math.PI * frequency * index) / inputRate),
  );
}

function measureAfterResampling(frequency: number) {
  const input = createTone(frequency);
  const output = resampleAudio(input, inputRate, outputRate);

  assert.equal(
    output.length,
    outputRate * durationSeconds,
    'resampler returned an unexpected output length',
  );
  assert.ok(
    output.length > transientSamples * 2,
    'resampled output is too short for the transient exclusion',
  );

  const interior = output.subarray(
    transientSamples,
    output.length - transientSamples,
  );
  return { inputRms: rms(input), outputRms: rms(interior), interior };
}

function toneComponentRms(
  samples: Float32Array,
  sampleRate: number,
  frequency: number,
): number {
  let cosineProjection = 0;
  let sineProjection = 0;

  for (let index = 0; index < samples.length; index++) {
    const phase = (2 * Math.PI * frequency * index) / sampleRate;
    cosineProjection += samples[index] * Math.cos(phase);
    sineProjection += samples[index] * Math.sin(phase);
  }

  const amplitude =
    (2 / samples.length) * Math.hypot(cosineProjection, sineProjection);
  return amplitude / Math.SQRT2;
}

async function main() {
  const passband = measureAfterResampling(passbandFrequency);
  const stopband = measureAfterResampling(stopbandFrequency);
  const passbandGainDb =
    20 * Math.log10(passband.outputRms / passband.inputRms);
  const attenuationDb =
    20 * Math.log10(stopband.outputRms / passband.outputRms);
  const aliasComponentRms = toneComponentRms(
    stopband.interior,
    outputRate,
    aliasFrequency,
  );

  console.log({
    passbandRms: passband.outputRms,
    passbandGainDb,
    aboveNyquistRms: stopband.outputRms,
    attenuationDb,
    aliasComponentRms,
  });

  assert.ok(
    Math.abs(passbandGainDb) <= maximumPassbandGainErrorDb,
    `1 kHz passband gain must remain within ${maximumPassbandGainErrorDb} dB, received ${passbandGainDb.toFixed(3)} dB`,
  );

  if (attenuationDb > requiredStopbandAttenuationDb) {
    throw new ReproducedBugError(
      `16 kHz stopband attenuation was ${attenuationDb.toFixed(3)} dB`,
    );
  }

  console.log('Issue #22852 did not reproduce.');
}

main().catch(error => {
  if (error instanceof ReproducedBugError) {
    console.error(
      'ISSUE_22852_REPRODUCED: 16 kHz input remains above the -40 dB stopband target when downsampling 48 kHz audio to 24 kHz',
    );
    console.error(error.message);
    process.exitCode = 1;
    return;
  }

  console.error('REPRODUCTION_HARNESS_ERROR', error);
  process.exitCode = 2;
});
