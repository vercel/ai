// @ts-nocheck
import { openai } from '@ai-sdk/openai';
import {
  createDataStream,
  streamText,
  formatDataStreamPart,
  DataStreamWriter,
} from 'ai';

// Test writer.writeData() transformation
const dataStream1 = createDataStream({
  execute: async writer => {
    writer.writeData('initialized call');
    writer.writeData('call completed');
  },
});

// Test writer.writeMessageAnnotation() transformation
const dataStream2 = createDataStream({
  execute: async writer => {
    writer.writeMessageAnnotation({ chunk: '123' });
    writer.writeMessageAnnotation({
      id: 'abc123',
      other: 'information',
    });
  },
});

// Test writer.writeSource() transformation
const dataStream3 = createDataStream({
  execute: writer => {
    writer.writeSource({
      sourceType: 'url',
      id: 'source-1',
      url: 'https://example.com',
      title: 'Example Source',
    });
  },
});

// Test formatDataStreamPart() transformation for tool results
async function processToolCalls(dataStream: DataStreamWriter) {
  dataStream.write(
    formatDataStreamPart('tool_result', {
      toolCallId: 'call_123',
      result: 'success',
    }),
  );
}

// Test mixed usage
const dataStream4 = createDataStream({
  execute: writer => {
    writer.writeData('start');

    const result = streamText({
      model: openai('gpt-4o'),
      messages: [],
      onChunk() {
        writer.writeMessageAnnotation({ chunk: 'chunk-data' });
      },
      onFinish() {
        writer.writeMessageAnnotation({
          id: 'final-id',
          status: 'complete',
        });
        writer.writeData('finished');
      },
    });

    return result.toAIStreamResponse();
  },
});

// Test source with existing type property (should not duplicate)
const dataStream5 = createDataStream({
  execute: writer => {
    writer.writeSource({
      type: 'file',
      id: 'file-1',
      name: 'document.pdf',
    });
  },
});
