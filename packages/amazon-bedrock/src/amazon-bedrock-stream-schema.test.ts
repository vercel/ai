import { describe, expect, it } from 'vitest';
import { AmazonBedrockStreamSchema } from './amazon-bedrock-chat-language-model';

describe('AmazonBedrockStreamSchema', () => {
  it('accepts text content block deltas', () => {
    const result = AmazonBedrockStreamSchema.safeParse({
      contentBlockDelta: {
        contentBlockIndex: 0,
        delta: { text: 'Hello' },
      },
    });

    expect(result.success).toBe(true);
  });

  it('accepts citation content block deltas when citations are enabled', () => {
    const result = AmazonBedrockStreamSchema.safeParse({
      contentBlockDelta: {
        contentBlockIndex: 3,
        delta: {
          citation: {
            location: {
              documentPage: { documentIndex: 0, end: 2, start: 1 },
            },
            sourceContent: [{ text: 'CONTENT_OF_PDF' }],
            title: 'document-1',
          },
        },
      },
    });

    expect(result.success).toBe(true);
  });
});
