import { describe, it, expect } from 'vitest';
import { parseVertexModelId } from './parse-vertex-model-id';

describe('parseVertexModelId', () => {
  it('should parse model ID with publisher prefix', () => {
    const result = parseVertexModelId('zai-org/glm-4.7-maas');
    expect(result).toEqual({
      publisher: 'zai-org',
      modelName: 'glm-4.7-maas',
    });
  });

  it('should use google as default publisher when no prefix', () => {
    const result = parseVertexModelId('gemini-2.5-flash');
    expect(result).toEqual({
      publisher: 'google',
      modelName: 'gemini-2.5-flash',
    });
  });

  it('should parse model ID with google prefix explicitly', () => {
    const result = parseVertexModelId('google/gemini-2.5-pro');
    expect(result).toEqual({
      publisher: 'google',
      modelName: 'gemini-2.5-pro',
    });
  });

  it('should handle model ID with multiple segments', () => {
    const result = parseVertexModelId('my-org/my-model-name');
    expect(result).toEqual({
      publisher: 'my-org',
      modelName: 'my-model-name',
    });
  });

  it('should handle model ID with dots in model name', () => {
    const result = parseVertexModelId('org/claude-3.5-sonnet');
    expect(result).toEqual({
      publisher: 'org',
      modelName: 'claude-3.5-sonnet',
    });
  });

  it('should handle model ID with hyphens in publisher', () => {
    const result = parseVertexModelId('my-publisher-org/model-name');
    expect(result).toEqual({
      publisher: 'my-publisher-org',
      modelName: 'model-name',
    });
  });
});
