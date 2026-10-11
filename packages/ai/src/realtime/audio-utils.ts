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

/**
 * Resamples audio from one sample rate to another using linear
 * interpolation. Suitable for voice audio.
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

/**
 * Resamples consecutive chunks while retaining the interpolation position
 * between them.
 */
export class StreamingAudioResampler {
  private nextInputPosition = 0;
  private previousSample: number | undefined;
  private inputLength = 0;
  private outputLength = 0;

  constructor(
    private readonly inputRate: number,
    private readonly outputRate: number,
  ) {}

  process(input: Float32Array): Float32Array {
    if (this.inputRate === this.outputRate) {
      return input;
    }
    if (input.length === 0) {
      return input;
    }

    const maximumInputPosition = (input.length - 1) * this.outputRate;
    const availableOutputLength =
      this.nextInputPosition > maximumInputPosition
        ? 0
        : Math.floor(
            (maximumInputPosition - this.nextInputPosition) / this.inputRate,
          ) + 1;
    const targetOutputLength = Math.round(
      ((this.inputLength + input.length) * this.outputRate) / this.inputRate,
    );
    const outputLength = Math.min(
      availableOutputLength,
      targetOutputLength - this.outputLength,
    );
    const output = new Float32Array(outputLength);

    for (let index = 0; index < outputLength; index++) {
      const inputIndex = Math.floor(this.nextInputPosition / this.outputRate);
      const fraction =
        (this.nextInputPosition - inputIndex * this.outputRate) /
        this.outputRate;
      const lowerSample =
        inputIndex === -1 ? this.previousSample! : input[inputIndex];
      const upperSample = fraction === 0 ? lowerSample : input[inputIndex + 1];

      output[index] = lowerSample * (1 - fraction) + upperSample * fraction;
      this.nextInputPosition += this.inputRate;
    }

    this.nextInputPosition -= input.length * this.outputRate;
    this.previousSample = input[input.length - 1];
    this.inputLength += input.length;
    this.outputLength += output.length;

    return output;
  }

  finish(): Float32Array {
    if (
      this.inputRate === this.outputRate ||
      this.previousSample === undefined
    ) {
      return new Float32Array();
    }

    const remainingOutputLength =
      Math.round((this.inputLength * this.outputRate) / this.inputRate) -
      this.outputLength;
    const output = new Float32Array(remainingOutputLength);
    output.fill(this.previousSample);
    this.outputLength += output.length;
    return output;
  }
}
