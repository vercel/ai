import {
  convertArrayToReadableStream,
  convertReadableStreamToArray,
} from 'ai/test';
import {
  toUIMessageStream,
  toTaggedUIMessageStream,
} from './langchain-adapter';

describe('toUIMessageStream', () => {
  it('should convert ReadableStream<LangChainAIMessageChunk>', async () => {
    const inputStream = convertArrayToReadableStream([
      { content: 'Hello' },
      { content: [{ type: 'text', text: 'World' }] },
    ]);

    expect(await convertReadableStreamToArray(toUIMessageStream(inputStream)))
      .toMatchInlineSnapshot(`
        [
          {
            "id": "1",
            "type": "text-start",
          },
          {
            "delta": "Hello",
            "id": "1",
            "type": "text-delta",
          },
          {
            "delta": "World",
            "id": "1",
            "type": "text-delta",
          },
          {
            "id": "1",
            "type": "text-end",
          },
        ]
      `);
  });

  it('should convert ReadableStream<string> (LangChain StringOutputParser)', async () => {
    const inputStream = convertArrayToReadableStream(['Hello', 'World']);

    expect(await convertReadableStreamToArray(toUIMessageStream(inputStream)))
      .toMatchInlineSnapshot(`
        [
          {
            "id": "1",
            "type": "text-start",
          },
          {
            "delta": "Hello",
            "id": "1",
            "type": "text-delta",
          },
          {
            "delta": "World",
            "id": "1",
            "type": "text-delta",
          },
          {
            "id": "1",
            "type": "text-end",
          },
        ]
      `);
  });

  it('should convert ReadableStream<LangChainStreamEvent>', async () => {
    const inputStream = convertArrayToReadableStream([
      { event: 'on_chat_model_stream', data: { chunk: { content: 'Hello' } } },
      { event: 'on_chat_model_stream', data: { chunk: { content: 'World' } } },
    ]);

    expect(await convertReadableStreamToArray(toUIMessageStream(inputStream)))
      .toMatchInlineSnapshot(`
      [
        {
          "id": "1",
          "type": "text-start",
        },
        {
          "delta": "Hello",
          "id": "1",
          "type": "text-delta",
        },
        {
          "delta": "World",
          "id": "1",
          "type": "text-delta",
        },
        {
          "id": "1",
          "type": "text-end",
        },
      ]
    `);
  });
});

describe('toTaggedUIMessageStream', () => {
  it('should create separate parts for different tag sets', async () => {
    const inputStream = convertArrayToReadableStream([
      {
        event: 'on_chat_model_stream',
        data: { chunk: { content: 'Research content' } },
        tags: ['stage:research'],
      },
      {
        event: 'on_chat_model_stream',
        data: { chunk: { content: ' more research' } },
        tags: ['stage:research'],
      },
      {
        event: 'on_chat_model_stream',
        data: { chunk: { content: 'Synthesis content' } },
        tags: ['stage:synthesis'],
      },
    ]);

    const outputStream = toTaggedUIMessageStream(inputStream, [
      'stage:research',
      'stage:synthesis',
    ]);
    const reader = outputStream.getReader();

    // First metadata chunk - only research should have part 1
    expect((await reader.read()).value).toEqual({
      type: 'message-metadata',
      messageMetadata: {
        tagMapping: {
          'stage:research': [1],
          'stage:synthesis': [],
        },
      },
    });

    // Text start for part 1
    expect((await reader.read()).value).toEqual({
      type: 'text-start',
      id: '1',
    });

    // First delta
    expect((await reader.read()).value).toEqual({
      type: 'text-delta',
      delta: 'Research content',
      id: '1',
    });

    // Second delta (same part)
    expect((await reader.read()).value).toEqual({
      type: 'text-delta',
      delta: ' more research',
      id: '1',
    });

    // End first part
    expect((await reader.read()).value).toEqual({ type: 'text-end', id: '1' });

    // Second metadata chunk - now synthesis should have part 2
    expect((await reader.read()).value).toEqual({
      type: 'message-metadata',
      messageMetadata: {
        tagMapping: {
          'stage:research': [1],
          'stage:synthesis': [2],
        },
      },
    });

    // Text start for part 2
    expect((await reader.read()).value).toEqual({
      type: 'text-start',
      id: '2',
    });

    // Synthesis content
    expect((await reader.read()).value).toEqual({
      type: 'text-delta',
      delta: 'Synthesis content',
      id: '2',
    });

    // End second part
    expect((await reader.read()).value).toEqual({ type: 'text-end', id: '2' });

    // Should be done
    expect((await reader.read()).done).toBe(true);

    reader.releaseLock();
  });

  it('should handle multiple tags per chunk', async () => {
    const inputStream = convertArrayToReadableStream([
      {
        event: 'on_chat_model_stream',
        data: { chunk: { content: 'Multi-tagged content' } },
        tags: ['stage:research', 'priority:high'],
      },
      {
        event: 'on_chat_model_stream',
        data: { chunk: { content: ' continues' } },
        tags: ['stage:research', 'priority:high'],
      },
    ]);

    expect(
      await convertReadableStreamToArray(
        toTaggedUIMessageStream(inputStream, [
          'stage:research',
          'priority:high',
        ]),
      ),
    ).toMatchInlineSnapshot(`
        [
          {
            "messageMetadata": {
              "tagMapping": {
                "priority:high": [
                  1,
                ],
                "stage:research": [
                  1,
                ],
              },
            },
            "type": "message-metadata",
          },
          {
            "id": "1",
            "type": "text-start",
          },
          {
            "delta": "Multi-tagged content",
            "id": "1",
            "type": "text-delta",
          },
          {
            "delta": " continues",
            "id": "1",
            "type": "text-delta",
          },
          {
            "id": "1",
            "type": "text-end",
          },
        ]
      `);
  });

  it('should filter tags based on input parameter', async () => {
    const inputStream = convertArrayToReadableStream([
      {
        event: 'on_chat_model_stream',
        data: { chunk: { content: 'Filtered content' } },
        tags: ['stage:research', 'internal:debug', 'stage:synthesis'],
      },
    ]);

    expect(
      await convertReadableStreamToArray(
        toTaggedUIMessageStream(inputStream, [
          'stage:research',
          'stage:synthesis',
        ]),
      ),
    ).toMatchInlineSnapshot(`
        [
          {
            "messageMetadata": {
              "tagMapping": {
                "stage:research": [
                  1,
                ],
                "stage:synthesis": [
                  1,
                ],
              },
            },
            "type": "message-metadata",
          },
          {
            "id": "1",
            "type": "text-start",
          },
          {
            "delta": "Filtered content",
            "id": "1",
            "type": "text-delta",
          },
          {
            "id": "1",
            "type": "text-end",
          },
        ]
      `);
  });

  it('should handle chunks with no relevant tags', async () => {
    const inputStream = convertArrayToReadableStream([
      {
        event: 'on_chat_model_stream',
        data: { chunk: { content: 'Tagged content' } },
        tags: ['stage:research'],
      },
      {
        event: 'on_chat_model_stream',
        data: { chunk: { content: 'Untagged content' } },
        tags: ['internal:debug'],
      },
    ]);

    expect(
      await convertReadableStreamToArray(
        toTaggedUIMessageStream(inputStream, ['stage:research']),
      ),
    ).toMatchInlineSnapshot(`
        [
          {
            "messageMetadata": {
              "tagMapping": {
                "stage:research": [
                  1,
                ],
              },
            },
            "type": "message-metadata",
          },
          {
            "id": "1",
            "type": "text-start",
          },
          {
            "delta": "Tagged content",
            "id": "1",
            "type": "text-delta",
          },
          {
            "id": "1",
            "type": "text-end",
          },
          {
            "messageMetadata": {
              "tagMapping": {
                "stage:research": [
                  1,
                ],
              },
            },
            "type": "message-metadata",
          },
          {
            "id": "2",
            "type": "text-start",
          },
          {
            "delta": "Untagged content",
            "id": "2",
            "type": "text-delta",
          },
          {
            "id": "2",
            "type": "text-end",
          },
        ]
      `);
  });

  it('should handle empty stream', async () => {
    const inputStream = convertArrayToReadableStream([]);

    expect(
      await convertReadableStreamToArray(
        toTaggedUIMessageStream(inputStream, ['stage:research']),
      ),
    ).toMatchInlineSnapshot(`[]`);
  });

  it('should accumulate tag mappings correctly', async () => {
    const inputStream = convertArrayToReadableStream([
      {
        event: 'on_chat_model_stream',
        data: { chunk: { content: 'First' } },
        tags: ['tag1'],
      },
      {
        event: 'on_chat_model_stream',
        data: { chunk: { content: 'Second' } },
        tags: ['tag2'],
      },
      {
        event: 'on_chat_model_stream',
        data: { chunk: { content: 'Third' } },
        tags: ['tag1'],
      },
    ]);

    const result = await convertReadableStreamToArray(
      toTaggedUIMessageStream(inputStream, ['tag1', 'tag2']),
    );

    // Check final metadata has both parts for tag1
    const finalMetadata = result.find(
      chunk =>
        chunk.type === 'message-metadata' &&
        chunk.messageMetadata?.tagMapping?.tag1?.length === 2,
    );
    expect(finalMetadata?.messageMetadata?.tagMapping).toEqual({
      tag1: [1, 3],
      tag2: [2],
    });
  });
});
