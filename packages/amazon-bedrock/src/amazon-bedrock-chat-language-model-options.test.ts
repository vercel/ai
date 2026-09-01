import { describe, expect, it } from 'vitest';
import {
  amazonBedrockLanguageModelChatOptions,
  type AmazonBedrockLanguageModelChatOptions,
} from './amazon-bedrock-chat-language-model-options';
describe('amazonBedrockLanguageModelChatOptions', () => {
  describe('guardrailConfig', () => {
    it('accepts valid guardrail config values', () => {
      const result = amazonBedrockLanguageModelChatOptions.safeParse({
        guardrailConfig: {
          guardrailIdentifier: 'xxxxxxxx',
          guardrailVersion: 'DRAFT',
          trace: 'enabled_full',
          streamProcessingMode: 'async',
        },
      });

      expect(result.success).toBe(true);
      expect(result.data?.guardrailConfig).toEqual({
        guardrailIdentifier: 'xxxxxxxx',
        guardrailVersion: 'DRAFT',
        trace: 'enabled_full',
        streamProcessingMode: 'async',
      });
    });

    it('rejects invalid guardrail config enum values', () => {
      const result = amazonBedrockLanguageModelChatOptions.safeParse({
        guardrailConfig: {
          trace: 'on',
          streamProcessingMode: 'background',
        },
      });

      expect(result.success).toBe(false);
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
        guardrailConfig: {
          guardrailIdentifier: 'xxxxxxxx',
          guardrailVersion: 'DRAFT',
          trace: 'enabled',
          streamProcessingMode: 'async',
        },
        serviceTier: 'priority',
      };

      expect(options.guardrailConfig?.streamProcessingMode).toBe('async');
      expect(options.serviceTier).toBe('priority');
    });
  });
});
