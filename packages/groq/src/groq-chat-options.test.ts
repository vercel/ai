import { describe, it, expect } from 'vitest';
import { groqProviderOptions, GroqProviderOptions } from './groq-chat-options';

describe('groqProviderOptions', () => {
  describe('reasoningEffort', () => {
    it('accepts valid reasoningEffort values', () => {
      const validValues = ['none', 'default', 'low', 'medium', 'high'] as const;

      validValues.forEach(value => {
        const result = groqProviderOptions.safeParse({
          reasoningEffort: value,
        });
        expect(result.success).toBe(true);
        expect(result.data?.reasoningEffort).toBe(value);
      });
    });

    it('rejects invalid reasoningEffort values', () => {
      const invalidValues = [
        'invalid',
        'high-effort',
        'minimal',
        'maximum',
        '',
      ];

      invalidValues.forEach(value => {
        const result = groqProviderOptions.safeParse({
          reasoningEffort: value,
        });
        expect(result.success).toBe(false);
      });
    });

    it('allows reasoningEffort to be undefined', () => {
      const result = groqProviderOptions.safeParse({});
      expect(result.success).toBe(true);
      expect(result.data?.reasoningEffort).toBeUndefined();
    });

    it('allows reasoningEffort to be omitted explicitly', () => {
      const result = groqProviderOptions.safeParse({
        reasoningEffort: undefined,
      });
      expect(result.success).toBe(true);
      expect(result.data?.reasoningEffort).toBeUndefined();
    });
  });

  describe('combined options with reasoningEffort', () => {
    it('accepts reasoningEffort with other valid options', () => {
      const result = groqProviderOptions.safeParse({
        reasoningEffort: 'high',
        parallelToolCalls: true,
        user: 'test-user',
        structuredOutputs: false,
        serviceTier: 'flex',
      });

      expect(result.success).toBe(true);
      expect(result.data?.reasoningEffort).toBe('high');
      expect(result.data?.parallelToolCalls).toBe(true);
      expect(result.data?.user).toBe('test-user');
    });

    it('rejects when reasoningEffort is invalid among valid options', () => {
      const result = groqProviderOptions.safeParse({
        reasoningEffort: 'ultra-high',
        parallelToolCalls: true,
        user: 'test-user',
      });

      expect(result.success).toBe(false);
    });
  });

  describe('all reasoningEffort enum variants', () => {
    it('validates all reasoningEffort variants individually', () => {
      const variants: Array<'none' | 'default' | 'low' | 'medium' | 'high'> = [
        'none',
        'default',
        'low',
        'medium',
        'high',
      ];

      variants.forEach(variant => {
        const result = groqProviderOptions.safeParse({
          reasoningEffort: variant,
        });
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.reasoningEffort).toBe(variant);
        }
      });
    });
  });

  describe('type inference', () => {
    it('infers GroqProviderOptions type correctly', () => {
      const options: GroqProviderOptions = {
        reasoningEffort: 'medium',
        parallelToolCalls: false,
      };

      expect(options.reasoningEffort).toBe('medium');
      expect(options.parallelToolCalls).toBe(false);
    });
  });
});
