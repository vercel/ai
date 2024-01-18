import { experimental_StreamData } from './stream-data';

export async function forwardLmntSpeechStream(
  speechStream: AsyncIterable<any>,
  data: experimental_StreamData,
  options: {
    onFinal(): Promise<void> | void;
  },
) {
  for await (const chunk of speechStream) {
    data.appendSpeechBuffer((chunk as any).audio);
  }
  options.onFinal();
}
