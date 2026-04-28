import { describe, expect, it } from 'vitest';
import {
  amazonBedrockLanguageModelOptions,
  AmazonBedrockLanguageModelOptions,
} from './bedrock-chat-options';

describe('amazonBedrockLanguageModelOptions', () => {
  describe('serviceTier', () => {
    it('accepts valid service tier values', () => {
      const validValues = ['reserved', 'priority', 'default', 'flex'] as const;

      validValues.forEach(value => {
        const result = amazonBedrockLanguageModelOptions.safeParse({
          serviceTier: value,
        });

        expect(result.success).toBe(true);
        expect(result.data?.serviceTier).toBe(value);
      });
    });

    it('rejects invalid service tier values', () => {
      const invalidValues = ['on-demand', 'auto', 'standard', '', 'PRIORITY'];

      invalidValues.forEach(value => {
        const result = amazonBedrockLanguageModelOptions.safeParse({
          serviceTier: value,
        });

        expect(result.success).toBe(false);
      });
    });
  });

  describe('type inference', () => {
    it('infers AmazonBedrockLanguageModelOptions type correctly', () => {
      const options: AmazonBedrockLanguageModelOptions = {
        serviceTier: 'priority',
      };

      expect(options.serviceTier).toBe('priority');
    });
  });
});
