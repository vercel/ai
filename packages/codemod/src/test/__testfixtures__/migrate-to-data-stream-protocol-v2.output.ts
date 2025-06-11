// @ts-nocheck
import { openai } from '@ai-sdk/openai';
import { createDataStream, streamText, DataStreamWriter } from 'ai';

// Test writer.writeData() transformation
const dataStream1 = createDataStream({
  execute: async writer => {
    writer.write({
      'type': 'data',
      'value': ['initialized call']
    });
    writer.write({
      'type': 'data',
      'value': ['call completed']
    });
  },
});

// Test writer.writeMessageAnnotation() transformation
const dataStream2 = createDataStream({
  execute: async writer => {
    writer.write({
      'type': 'message-annotations',
      'value': [{ chunk: '123' }]
    });
    writer.write({
      'type': 'message-annotations',

      'value': [{
        id: 'abc123',
        other: 'information',
      }]
    });
  },
});

// Test writer.writeSource() transformation
const dataStream3 = createDataStream({
  execute: writer => {
    writer.write({
      'type': 'source',

      'value': {
        sourceType: 'url',
        id: 'source-1',
        url: 'https://example.com',
        title: 'Example Source',
      }
    });
  },
});

// Test formatDataStreamPart() transformation for tool results
async function processToolCalls(dataStream: DataStreamWriter) {
  dataStream.write(
    {
      'type': 'tool-result',

      'value': {
        toolCallId: 'call_123',
        result: 'success',
      }
    },
  );
}

// Test mixed usage
const dataStream4 = createDataStream({
  execute: writer => {
    writer.write({
      'type': 'data',
      'value': ['start']
    });

    const result = streamText({
      model: openai('gpt-4o'),
      messages: [],
      onChunk() {
        writer.write({
          'type': 'message-annotations',
          'value': [{ chunk: 'chunk-data' }]
        });
      },
      onFinish() {
        writer.write({
          'type': 'message-annotations',

          'value': [{
            id: 'final-id',
            status: 'complete',
          }]
        });
        writer.write({
          'type': 'data',
          'value': ['finished']
        });
      },
    });

    return result.toAIStreamResponse();
  },
});

// Test source with existing type property (should not duplicate)
const dataStream5 = createDataStream({
  execute: writer => {
    writer.write({
      'type': 'source',

      'value': {
        type: 'file',
        id: 'file-1',
        name: 'document.pdf',
      }
    });
  },
});
