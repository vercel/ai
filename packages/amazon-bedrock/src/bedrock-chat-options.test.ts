import { describe, expect, it } from 'vitest';
import {
  bedrockProviderOptions,
  type BedrockProviderOptions,
} from './bedrock-chat-options';

describe('bedrockProviderOptions', () => {
  describe('structuredOutputMode', () => {
    it.each(['outputFormat', 'jsonTool', 'auto'] as const)(
      'accepts %s',
      structuredOutputMode => {
        const result = bedrockProviderOptions.safeParse({
          structuredOutputMode,
        });

        expect(result.success).toBe(true);
        expect(result.data?.structuredOutputMode).toBe(structuredOutputMode);
      },
    );

    it('rejects invalid values', () => {
      const result = bedrockProviderOptions.safeParse({
        structuredOutputMode: 'native',
      });

      expect(result.success).toBe(false);
    });
  });

  it('infers structuredOutputMode in BedrockProviderOptions', () => {
    const options: BedrockProviderOptions = {
      structuredOutputMode: 'jsonTool',
    };

    expect(options.structuredOutputMode).toBe('jsonTool');
  });
});
