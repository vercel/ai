import { describe, expect, it } from 'vitest';
import type { TextStreamPart } from '../generate-text/stream-text-result';
import type { UIMessage } from '../ui/ui-messages';
import { toUIMessageChunk } from './to-ui-message-chunk';

describe('toUIMessageChunk', () => {
  it('maps text stream parts to UI message chunks', () => {
    expect(
      toUIMessageChunk({
        type: 'text-delta',
        id: 'text-1',
        text: 'hello',
      }),
    ).toEqual({
      type: 'text-delta',
      id: 'text-1',
      delta: 'hello',
    });
  });

  it('skips sources by default and sends them when enabled', () => {
    const sourcePart: TextStreamPart<{}> = {
      type: 'source',
      sourceType: 'url',
      id: 'source-1',
      url: 'https://example.com',
      title: 'Example',
    };

    expect(toUIMessageChunk(sourcePart)).toBeUndefined();
    expect(toUIMessageChunk(sourcePart, { sendSources: true })).toEqual({
      type: 'source-url',
      sourceId: 'source-1',
      url: 'https://example.com',
      title: 'Example',
    });
  });

  it('adds start chunk metadata and message id', () => {
    expect(
      toUIMessageChunk(
        { type: 'start' },
        {
          messageMetadata: { model: 'test-model' },
          responseMessageId: 'msg-1',
        },
      ),
    ).toEqual({
      type: 'start',
      messageId: 'msg-1',
      messageMetadata: { model: 'test-model' },
    });
  });
});
