// @ts-nocheck
import {
  createUIMessageStreamResponse,
  createUIMessageStream,
  UIMessageStream,
  UIMessageStreamWriter,
  UIMessageStreamOptions,
} from 'ai';

async function handler() {
  const stream: UIMessageStream = await createUIMessageStream();
  const writer: UIMessageStreamWriter = stream.writer;

  const options: UIMessageStreamOptions = {
    onError: (error) => console.error(error),
  };

  const response = await createUIMessageStreamResponse({
    stream,
    options,
  });

  return response;
}

export type MyDataStream = UIMessageStream;
export type MyWriter = UIMessageStreamWriter;
export type MyOptions = UIMessageStreamOptions;

class StreamHandler {
  private stream: UIMessageStream;
  private writer: UIMessageStreamWriter;

  constructor(options: UIMessageStreamOptions) {
    this.stream = createUIMessageStream();
    this.writer = this.stream.writer;
  }

  async respond() {
    return createUIMessageStreamResponse(this.stream);
  }
}