export async function processInstructionStream(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  processInstruction: (instruction: string) => void | Promise<void>,
) {
  const decoder = new TextDecoder();
  let buffer = '';
  while (true) {
    const { done, value } = await reader.read();

    if (done) {
      if (buffer.length > 0) {
        processInstruction(buffer);
      }
      break;
    }

    buffer += decoder.decode(value, { stream: true });

    let endIndex: number;
    while ((endIndex = buffer.indexOf('\n\n')) !== -1) {
      processInstruction(buffer.substring(0, endIndex).trim());
      buffer = buffer.substring(endIndex + 2); // Remove the processed instruction + delimiter
    }
  }
}
