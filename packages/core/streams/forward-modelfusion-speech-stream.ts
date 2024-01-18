import { experimental_StreamData } from './stream-data';

export async function forwardModelFusionSpeechStream(
  speechStream: AsyncIterable<Buffer>,
  data: experimental_StreamData,
  options: {
    onFinal(): Promise<void> | void;
  },
) {
  for await (const chunk of speechStream) {
    data.appendSpeechBuffer(chunk);
  }
  options.onFinal();
}
