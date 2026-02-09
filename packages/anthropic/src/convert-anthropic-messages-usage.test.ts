import { describe, it, expect } from 'vitest';
import {
  convertAnthropicMessagesUsage,
  AnthropicMessagesUsage,
} from './convert-anthropic-messages-usage';

describe('convertAnthropicMessagesUsage', () => {
  describe('basic usage without iterations', () => {
    it('should convert basic usage correctly', () => {
      const usage: AnthropicMessagesUsage = {
        input_tokens: 100,
        output_tokens: 50,
      };

      const result = convertAnthropicMessagesUsage(usage);

      expect(result).toEqual({
        inputTokens: {
          total: 100,
          noCache: 100,
          cacheRead: 0,
          cacheWrite: 0,
        },
        outputTokens: {
          total: 50,
          text: undefined,
          reasoning: undefined,
        },
        raw: usage,
      });
    });

    it('should handle cache tokens correctly', () => {
      const usage: AnthropicMessagesUsage = {
        input_tokens: 100,
        output_tokens: 50,
        cache_creation_input_tokens: 25,
        cache_read_input_tokens: 10,
      };

      const result = convertAnthropicMessagesUsage(usage);

      expect(result).toEqual({
        inputTokens: {
          total: 135, // 100 + 25 + 10
          noCache: 100,
          cacheRead: 10,
          cacheWrite: 25,
        },
        outputTokens: {
          total: 50,
          text: undefined,
          reasoning: undefined,
        },
        raw: usage,
      });
    });

    it('should handle null cache tokens', () => {
      const usage: AnthropicMessagesUsage = {
        input_tokens: 100,
        output_tokens: 50,
        cache_creation_input_tokens: null,
        cache_read_input_tokens: null,
      };

      const result = convertAnthropicMessagesUsage(usage);

      expect(result.inputTokens.total).toBe(100);
      expect(result.inputTokens.cacheRead).toBe(0);
      expect(result.inputTokens.cacheWrite).toBe(0);
    });
  });

  describe('compaction usage with iterations', () => {
    it('should sum across all iterations when iterations array is present', () => {
      // Based on compaction.md documentation:
      // The top-level input_tokens (45000) and output_tokens (1234) do NOT include
      // compaction iteration usage. Total billed = sum of all iterations.
      const usage: AnthropicMessagesUsage = {
        input_tokens: 45000,
        output_tokens: 1234,
        iterations: [
          {
            type: 'compaction',
            input_tokens: 180000,
            output_tokens: 3500,
          },
          {
            type: 'message',
            input_tokens: 23000,
            output_tokens: 1000,
          },
        ],
      };

      const result = convertAnthropicMessagesUsage(usage);

      // Total should be sum of iterations, not top-level values
      expect(result.inputTokens.total).toBe(203000); // 180000 + 23000
      expect(result.inputTokens.noCache).toBe(203000);
      expect(result.outputTokens.total).toBe(4500); // 3500 + 1000
      expect(result.raw).toBe(usage);
    });

    it('should handle single iteration (message only, no compaction triggered)', () => {
      const usage: AnthropicMessagesUsage = {
        input_tokens: 5000,
        output_tokens: 500,
        iterations: [
          {
            type: 'message',
            input_tokens: 5000,
            output_tokens: 500,
          },
        ],
      };

      const result = convertAnthropicMessagesUsage(usage);

      expect(result.inputTokens.total).toBe(5000);
      expect(result.outputTokens.total).toBe(500);
    });

    it('should handle multiple compaction iterations (long-running task)', () => {
      // When using server tools, compaction may occur multiple times
      const usage: AnthropicMessagesUsage = {
        input_tokens: 10000,
        output_tokens: 500,
        iterations: [
          {
            type: 'compaction',
            input_tokens: 200000,
            output_tokens: 4000,
          },
          {
            type: 'message',
            input_tokens: 50000,
            output_tokens: 2000,
          },
          {
            type: 'compaction',
            input_tokens: 180000,
            output_tokens: 3500,
          },
          {
            type: 'message',
            input_tokens: 30000,
            output_tokens: 1500,
          },
        ],
      };

      const result = convertAnthropicMessagesUsage(usage);

      // Total = 200000 + 50000 + 180000 + 30000 = 460000 input
      // Total = 4000 + 2000 + 3500 + 1500 = 11000 output
      expect(result.inputTokens.total).toBe(460000);
      expect(result.outputTokens.total).toBe(11000);
    });

    it('should combine iterations with cache tokens', () => {
      const usage: AnthropicMessagesUsage = {
        input_tokens: 45000,
        output_tokens: 1234,
        cache_creation_input_tokens: 1000,
        cache_read_input_tokens: 500,
        iterations: [
          {
            type: 'compaction',
            input_tokens: 180000,
            output_tokens: 3500,
          },
          {
            type: 'message',
            input_tokens: 23000,
            output_tokens: 1000,
          },
        ],
      };

      const result = convertAnthropicMessagesUsage(usage);

      // Total input = sum of iterations + cache tokens
      // noCache = sum of iterations only
      expect(result.inputTokens.noCache).toBe(203000); // 180000 + 23000
      expect(result.inputTokens.cacheWrite).toBe(1000);
      expect(result.inputTokens.cacheRead).toBe(500);
      expect(result.inputTokens.total).toBe(204500); // 203000 + 1000 + 500
      expect(result.outputTokens.total).toBe(4500); // 3500 + 1000
    });
  });

  describe('edge cases', () => {
    it('should use top-level values when iterations is null', () => {
      const usage: AnthropicMessagesUsage = {
        input_tokens: 100,
        output_tokens: 50,
        iterations: null,
      };

      const result = convertAnthropicMessagesUsage(usage);

      expect(result.inputTokens.total).toBe(100);
      expect(result.outputTokens.total).toBe(50);
    });

    it('should use top-level values when iterations is undefined', () => {
      const usage: AnthropicMessagesUsage = {
        input_tokens: 100,
        output_tokens: 50,
      };

      const result = convertAnthropicMessagesUsage(usage);

      expect(result.inputTokens.total).toBe(100);
      expect(result.outputTokens.total).toBe(50);
    });

    it('should use top-level values when iterations array is empty', () => {
      const usage: AnthropicMessagesUsage = {
        input_tokens: 100,
        output_tokens: 50,
        iterations: [],
      };

      const result = convertAnthropicMessagesUsage(usage);

      expect(result.inputTokens.total).toBe(100);
      expect(result.outputTokens.total).toBe(50);
    });

    it('should handle zero tokens in iterations', () => {
      const usage: AnthropicMessagesUsage = {
        input_tokens: 0,
        output_tokens: 0,
        iterations: [
          {
            type: 'compaction',
            input_tokens: 0,
            output_tokens: 0,
          },
          {
            type: 'message',
            input_tokens: 0,
            output_tokens: 0,
          },
        ],
      };

      const result = convertAnthropicMessagesUsage(usage);

      expect(result.inputTokens.total).toBe(0);
      expect(result.outputTokens.total).toBe(0);
    });

    it('should preserve raw usage object in result', () => {
      const usage: AnthropicMessagesUsage = {
        input_tokens: 45000,
        output_tokens: 1234,
        iterations: [
          {
            type: 'compaction',
            input_tokens: 180000,
            output_tokens: 3500,
          },
          {
            type: 'message',
            input_tokens: 23000,
            output_tokens: 1000,
          },
        ],
      };

      const result = convertAnthropicMessagesUsage(usage);

      // raw should contain the original usage object including iterations
      expect(result.raw).toBe(usage);
      expect((result.raw as AnthropicMessagesUsage).iterations).toHaveLength(2);
    });
  });

  describe('real-world scenarios from documentation', () => {
    it('should match documentation example exactly', () => {
      // From compaction.md "Understanding usage" section
      const usage: AnthropicMessagesUsage = {
        input_tokens: 45000,
        output_tokens: 1234,
        iterations: [
          {
            type: 'compaction',
            input_tokens: 180000,
            output_tokens: 3500,
          },
          {
            type: 'message',
            input_tokens: 23000,
            output_tokens: 1000,
          },
        ],
      };

      const result = convertAnthropicMessagesUsage(usage);

      // Per documentation: "To calculate total tokens consumed and billed
      // for a request, sum across all entries in the usage.iterations array"
      const expectedTotalInput = 180000 + 23000; // 203000
      const expectedTotalOutput = 3500 + 1000; // 4500

      expect(result.inputTokens.total).toBe(expectedTotalInput);
      expect(result.outputTokens.total).toBe(expectedTotalOutput);

      // The top-level values (45000, 1234) are NOT the billed amounts
      // when iterations is present
      expect(result.inputTokens.total).not.toBe(usage.input_tokens);
      expect(result.outputTokens.total).not.toBe(usage.output_tokens);
    });

    it('should handle re-applying previous compaction block (no new compaction)', () => {
      // Per documentation: "Re-applying a previous compaction block incurs
      // no additional compaction cost, and the top-level usage fields remain
      // accurate in that case."
      // In this case, iterations array would not be present
      const usage: AnthropicMessagesUsage = {
        input_tokens: 15000,
        output_tokens: 800,
        // No iterations - previous compaction block was re-applied
      };

      const result = convertAnthropicMessagesUsage(usage);

      // Top-level values are accurate when no new compaction triggered
      expect(result.inputTokens.total).toBe(15000);
      expect(result.outputTokens.total).toBe(800);
    });
  });
});
