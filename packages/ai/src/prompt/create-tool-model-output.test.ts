import { Tool } from '@ai-sdk/provider-utils';
import { createToolModelOutput } from './create-tool-model-output';

describe('createToolModelOutput', () => {
  describe('error cases', () => {
    it('should return error type with string value when isError is true and output is string', () => {
      const result = createToolModelOutput({
        output: 'Error message',
        tool: undefined,
        errorMode: 'text',
      });

      expect(result).toEqual({
        type: 'error-text',
        value: 'Error message',
      });
    });

    it('should return error type with JSON stringified value when isError is true and output is not string', () => {
      const errorOutput = { error: 'Something went wrong', code: 500 };
      const result = createToolModelOutput({
        output: errorOutput,
        tool: undefined,
        errorMode: 'text',
      });

      expect(result).toEqual({
        type: 'error-text',
        value: JSON.stringify(errorOutput),
      });
    });

    it('should return error type with JSON stringified value for complex objects', () => {
      const complexError = {
        message: 'Complex error',
        details: {
          timestamp: '2023-01-01T00:00:00Z',
          stack: ['line1', 'line2'],
        },
      };
      const result = createToolModelOutput({
        output: complexError,
        tool: undefined,
        errorMode: 'text',
      });

      expect(result).toEqual({
        type: 'error-text',
        value: JSON.stringify(complexError),
      });
    });
  });

  describe('tool with toModelOutput', () => {
    it('should use tool.toModelOutput when available', () => {
      const mockTool: Tool = {
        toModelOutput: (output: any) => ({
          type: 'text',
          value: `Custom output: ${output}`,
        }),
      };

      const result = createToolModelOutput({
        output: 'test output',
        tool: mockTool,
        errorMode: 'none',
      });

      expect(result).toEqual({
        type: 'text',
        value: 'Custom output: test output',
      });
    });

    it('should use tool.toModelOutput with complex output', () => {
      const mockTool: Tool = {
        toModelOutput: (output: any) => ({
          type: 'json',
          value: { processed: output, timestamp: '2023-01-01' },
        }),
      };

      const complexOutput = { data: [1, 2, 3], status: 'success' };
      const result = createToolModelOutput({
        output: complexOutput,
        tool: mockTool,
        errorMode: 'none',
      });

      expect(result).toEqual({
        type: 'json',
        value: { processed: complexOutput, timestamp: '2023-01-01' },
      });
    });

    it('should use tool.toModelOutput returning content type', () => {
      const mockTool: Tool = {
        toModelOutput: () => ({
          type: 'content',
          value: [
            { type: 'text', text: 'Here is the result:' },
            { type: 'text', text: 'Additional information' },
          ],
        }),
      };

      const result = createToolModelOutput({
        output: 'any output',
        tool: mockTool,
        errorMode: 'none',
      });

      expect(result).toEqual({
        type: 'content',
        value: [
          { type: 'text', text: 'Here is the result:' },
          { type: 'text', text: 'Additional information' },
        ],
      });
    });
  });

  describe('string output without toModelOutput', () => {
    it('should return text type for string output', () => {
      const result = createToolModelOutput({
        output: 'Simple string output',
        tool: undefined,
        errorMode: 'none',
      });

      expect(result).toEqual({
        type: 'text',
        value: 'Simple string output',
      });
    });

    it('should return text type for string output even with tool that has no toModelOutput', () => {
      const toolWithoutToModelOutput: Tool = {
        description: 'A tool without toModelOutput',
      };

      const result = createToolModelOutput({
        output: 'String output',
        tool: toolWithoutToModelOutput,
        errorMode: 'none',
      });

      expect(result).toEqual({
        type: 'text',
        value: 'String output',
      });
    });

    it('should return text type for empty string', () => {
      const result = createToolModelOutput({
        output: '',
        tool: undefined,
        errorMode: 'none',
      });

      expect(result).toEqual({
        type: 'text',
        value: '',
      });
    });
  });

  describe('non-string output without toModelOutput', () => {
    it('should return json type for object output', () => {
      const objectOutput = { result: 'success', data: [1, 2, 3] };
      const result = createToolModelOutput({
        output: objectOutput,
        tool: undefined,
        errorMode: 'none',
      });

      expect(result).toEqual({
        type: 'json',
        value: objectOutput,
      });
    });

    it('should return json type for array output', () => {
      const arrayOutput = [1, 2, 3, 'test'];
      const result = createToolModelOutput({
        output: arrayOutput,
        tool: undefined,
        errorMode: 'none',
      });

      expect(result).toEqual({
        type: 'json',
        value: arrayOutput,
      });
    });

    it('should return json type for number output', () => {
      const result = createToolModelOutput({
        output: 42,
        tool: undefined,
        errorMode: 'none',
      });

      expect(result).toEqual({
        type: 'json',
        value: 42,
      });
    });

    it('should return json type for boolean output', () => {
      const result = createToolModelOutput({
        output: true,
        tool: undefined,
        errorMode: 'none',
      });

      expect(result).toEqual({
        type: 'json',
        value: true,
      });
    });

    it('should return json type for null output', () => {
      const result = createToolModelOutput({
        output: null,
        tool: undefined,
        errorMode: 'none',
      });

      expect(result).toEqual({
        type: 'json',
        value: null,
      });
    });

    it('should return json type for complex nested object', () => {
      const complexOutput = {
        user: {
          id: 123,
          name: 'John Doe',
          preferences: {
            theme: 'dark',
            notifications: true,
          },
        },
        metadata: {
          timestamp: '2023-01-01T00:00:00Z',
          version: '1.0.0',
        },
        items: [
          { id: 1, name: 'Item 1' },
          { id: 2, name: 'Item 2' },
        ],
      };

      const result = createToolModelOutput({
        output: complexOutput,
        tool: undefined,
        errorMode: 'none',
      });

      expect(result).toEqual({
        type: 'json',
        value: complexOutput,
      });
    });
  });

  describe('edge cases', () => {
    it('should prioritize isError over tool.toModelOutput', () => {
      const mockTool: Tool = {
        toModelOutput: () => ({
          type: 'text',
          value: 'This should not be called',
        }),
      };

      const result = createToolModelOutput({
        output: 'Error occurred',
        tool: mockTool,
        errorMode: 'text',
      });

      expect(result).toEqual({
        type: 'error-text',
        value: 'Error occurred',
      });
    });

    it('should handle undefined output in error text case', () => {
      const result = createToolModelOutput({
        output: undefined,
        tool: undefined,
        errorMode: 'text',
      });

      expect(result).toEqual({
        type: 'error-text',
        value: 'unknown error',
      });
    });

    it('should use null for undefined output in error json case', () => {
      const result = createToolModelOutput({
        output: undefined,
        tool: undefined,
        errorMode: 'json',
      });

      expect(result).toEqual({
        type: 'error-json',
        value: null,
      });
    });

    it('should use null for undefined output in non-error case', () => {
      const result = createToolModelOutput({
        output: undefined,
        tool: undefined,
        errorMode: 'none',
      });

      expect(result).toEqual({
        type: 'json',
        value: null,
      });
    });
  });
});
