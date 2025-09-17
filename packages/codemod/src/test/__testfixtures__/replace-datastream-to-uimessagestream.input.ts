// @ts-nocheck
import {
  createDataStreamResponse,
  createDataStream,
  DataStream,
  DataStreamWriter,
  DataStreamOptions,
} from 'ai';

async function handler() {
  const stream: DataStream = await createDataStream();
  const writer: DataStreamWriter = stream.writer;

  const options: DataStreamOptions = {
    onError: (error) => console.error(error),
  };

  const response = await createDataStreamResponse({
    stream,
    options,
  });

  return response;
}

export type MyDataStream = DataStream;
export type MyWriter = DataStreamWriter;
export type MyOptions = DataStreamOptions;

class StreamHandler {
  private stream: DataStream;
  private writer: DataStreamWriter;

  constructor(options: DataStreamOptions) {
    this.stream = createDataStream();
    this.writer = this.stream.writer;
  }

  async respond() {
    return createDataStreamResponse(this.stream);
  }
}