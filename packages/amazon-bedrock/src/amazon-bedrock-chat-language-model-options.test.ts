import { describe, expect, it } from 'vitest';
import {
  amazonBedrockLanguageModelChatOptions,
  type AmazonBedrockLanguageModelChatOptions,
} from './amazon-bedrock-chat-language-model-options';
describe('amazonBedrockLanguageModelChatOptions', () => {
  describe('structuredOutputMode', () => {
    it('accepts valid structured output modes', () => {
      const validValues = ['outputFormat', 'jsonTool', 'auto'] as const;

      validValues.forEach(value => {
        const result = amazonBedrockLanguageModelChatOptions.safeParse({
          structuredOutputMode: value,
        });

        expect(result.success).toBe(true);
        expect(result.data?.structuredOutputMode).toBe(value);
      });
    });

    it('rejects invalid structured output modes', () => {
      const invalidValues = ['native', 'tool', '', 'AUTO'];

      invalidValues.forEach(value => {
        const result = amazonBedrockLanguageModelChatOptions.safeParse({
          structuredOutputMode: value,
        });

        expect(result.success).toBe(false);
      });
    });
  });

  describe('serviceTier', () => {
    it('accepts valid service tier values', () => {
      const validValues = ['reserved', 'priority', 'default', 'flex'] as const;

      validValues.forEach(value => {
        const result = amazonBedrockLanguageModelChatOptions.safeParse({
          serviceTier: value,
        });

        expect(result.success).toBe(true);
        expect(result.data?.serviceTier).toBe(value);
      });
    });

    it('rejects invalid service tier values', () => {
      const invalidValues = ['on-demand', 'auto', 'standard', '', 'PRIORITY'];

      invalidValues.forEach(value => {
        const result = amazonBedrockLanguageModelChatOptions.safeParse({
          serviceTier: value,
        });

        expect(result.success).toBe(false);
      });
    });
  });

  describe('type inference', () => {
    it('infers AmazonBedrockLanguageModelChatOptions type correctly', () => {
      const options: AmazonBedrockLanguageModelChatOptions = {
        serviceTier: 'priority',
        structuredOutputMode: 'jsonTool',
      };

      expect(options.serviceTier).toBe('priority');
      expect(options.structuredOutputMode).toBe('jsonTool');
    });
  });
});
