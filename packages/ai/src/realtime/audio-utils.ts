/**
 * Converts Float32 audio samples to a base64-encoded PCM16 string
 * for sending to a realtime model via input_audio_buffer.append.
 *
 * Samples are expected to be in the range [-1.0, 1.0].
 * Output is 16-bit signed integer, little-endian, base64-encoded.
 */
export function encodeRealtimeAudio(float32Array: Float32Array): string {
  const buffer = new ArrayBuffer(float32Array.length * 2);
  const view = new DataView(buffer);

  for (let i = 0; i < float32Array.length; i++) {
    const s = Math.max(-1, Math.min(1, float32Array[i]));
    view.setInt16(i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }

  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  let binary = '';
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

/**
 * Converts a base64-encoded PCM16 string (from a realtime model's
 * audio-delta event) back to Float32 audio samples.
 *
 * Input is expected to be 16-bit signed integer, little-endian, base64-encoded.
 * Output samples are in the range [-1.0, 1.0].
 */
export function decodeRealtimeAudio(base64Audio: string): Float32Array {
  const binaryString = atob(base64Audio);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }

  const pcm16 = new Int16Array(bytes.buffer);
  const float32 = new Float32Array(pcm16.length);
  for (let i = 0; i < pcm16.length; i++) {
    float32[i] = pcm16[i] / 32768.0;
  }
  return float32;
}

const LOW_PASS_FILTER_HALF_LENGTH = 16;

function sinc(value: number): number {
  if (value === 0) {
    return 1;
  }

  const piValue = Math.PI * value;
  return Math.sin(piValue) / piValue;
}

/**
 * Resamples audio from one sample rate to another. Downsampling uses a
 * windowed-sinc low-pass filter to prevent frequencies above the output
 * Nyquist frequency from aliasing into the output. Upsampling uses linear
 * interpolation.
 *
 * @param input - Float32 audio samples at the input sample rate.
 * @param inputRate - The sample rate of the input audio (e.g. 48000).
 * @param outputRate - The desired output sample rate (e.g. 24000).
 * @returns Float32 audio samples at the output sample rate.
 */
export function resampleAudio(
  input: Float32Array,
  inputRate: number,
  outputRate: number,
): Float32Array {
  if (inputRate === outputRate) {
    return input;
  }

  const ratio = inputRate / outputRate;
  const outputLength = Math.round(input.length / ratio);
  const output = new Float32Array(outputLength);

  if (inputRate > outputRate) {
    const cutoff = outputRate / inputRate;
    const filterRadius = Math.ceil(LOW_PASS_FILTER_HALF_LENGTH / cutoff);

    for (let i = 0; i < outputLength; i++) {
      const srcIndex = i * ratio;
      const startIndex = Math.max(0, Math.ceil(srcIndex - filterRadius));
      const endIndex = Math.min(
        input.length - 1,
        Math.floor(srcIndex + filterRadius),
      );
      let value = 0;
      let weightSum = 0;

      for (let inputIndex = startIndex; inputIndex <= endIndex; inputIndex++) {
        const distance = srcIndex - inputIndex;
        const normalizedDistance = distance / filterRadius;
        const window =
          0.42 +
          0.5 * Math.cos(Math.PI * normalizedDistance) +
          0.08 * Math.cos(2 * Math.PI * normalizedDistance);
        const weight = cutoff * sinc(cutoff * distance) * window;

        value += input[inputIndex] * weight;
        weightSum += weight;
      }

      output[i] = weightSum === 0 ? 0 : value / weightSum;
    }

    return output;
  }

  for (let i = 0; i < outputLength; i++) {
    const srcIndex = i * ratio;
    const srcIndexFloor = Math.floor(srcIndex);
    const srcIndexCeil = Math.min(srcIndexFloor + 1, input.length - 1);
    const fraction = srcIndex - srcIndexFloor;

    output[i] =
      input[srcIndexFloor] * (1 - fraction) + input[srcIndexCeil] * fraction;
  }

  return output;
}
