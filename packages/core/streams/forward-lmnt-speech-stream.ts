import { experimental_StreamData } from './stream-data';

/**
 * Forwards an LMNT speech stream as stream data.
 */
export async function experimental_forwardLmntSpeechStream(
  speechStream: AsyncIterable<any>,
  data: experimental_StreamData,
  options: {
    onFinal(): Promise<void> | void;
  },
) {
  for await (const chunk of speechStream) {
    data.experimental_appendSpeech((chunk as any).audio.toString('base64'));
  }
  options.onFinal();
}
