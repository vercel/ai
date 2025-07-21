import { extractJSONFromReasoningResponse } from './extract-json-from-reasoning-response';

describe('extractJSONFromReasoningResponse', () => {
  it('should extract JSON after </think> tag', () => {
    const text = '<think>Some thinking process</think>{"result": "success"}';
    const result = extractJSONFromReasoningResponse(text);
    expect(result).toBe('{"result": "success"}');
  });

  it('should handle markdown code fences', () => {
    const text = '<think>Thinking</think>```json\n{"data": "value"}\n```';
    const result = extractJSONFromReasoningResponse(text);
    expect(result).toBe('{"data": "value"}');
  });

  it('should handle generic code fences', () => {
    const text = '<think>Thinking</think>```\n{"data": "value"}\n```';
    const result = extractJSONFromReasoningResponse(text);
    expect(result).toBe('{"data": "value"}');
  });

  it('should return original text when no </think> tag is found', () => {
    const text = '{"direct": "response"}';
    const result = extractJSONFromReasoningResponse(text);
    expect(result).toBe('{"direct": "response"}');
  });
});
