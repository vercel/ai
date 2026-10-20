export function resamplePcm16Mono(
  input: Uint8Array,
  inputRate: number,
  outputRate: number,
): Uint8Array {
  const inputView = new DataView(
    input.buffer,
    input.byteOffset,
    input.byteLength,
  );
  const inputSampleCount = Math.floor(input.byteLength / 2);
  const outputSampleCount = Math.floor(
    (inputSampleCount * outputRate) / inputRate,
  );
  const output = new Uint8Array(outputSampleCount * 2);
  const outputView = new DataView(output.buffer);

  for (let outputIndex = 0; outputIndex < outputSampleCount; outputIndex++) {
    const inputIndex = Math.floor((outputIndex * inputRate) / outputRate);
    outputView.setInt16(
      outputIndex * 2,
      inputView.getInt16(inputIndex * 2, true),
      true,
    );
  }

  return output;
}
