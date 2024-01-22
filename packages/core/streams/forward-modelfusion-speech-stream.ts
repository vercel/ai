import { experimental_StreamData } from './stream-data';

export async function forwardModelFusionSpeechStream(
  speechStream: AsyncIterable<Uint8Array>,
  data: experimental_StreamData,
  options: {
    onFinal(): Promise<void> | void;
  },
) {
  for await (const chunk of speechStream) {
    data.appendSpeech(btoa(String.fromCharCode(...chunk)));
  }
  options.onFinal();
}
