import { experimental_StreamData } from './stream-data';

export async function forwardModelFusionSpeechStream(
  speechStream: AsyncIterable<Uint8Array>,
  data: experimental_StreamData,
  options: {
    onFinal(): Promise<void> | void;
  },
) {
  for await (const chunk of speechStream) {
    const chunkArray = Array.from(chunk); // Convert Uint8Array to regular array
    data.appendSpeech(btoa(String.fromCharCode(...chunkArray)));
  }

  options.onFinal();
}
