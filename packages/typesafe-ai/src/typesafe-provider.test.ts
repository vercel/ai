import { NoSuchModelError } from '@ai-sdk/provider';
import { describe, expect, it } from 'vitest';
import { createTypeSafe, typesafe } from './typesafe-provider';

describe('TypeSafe provider', () => {
  it('provides the experimental evaluation capability', () => {
    const model = typesafe.evaluationModel('jev-latest');
    expect(typesafe.specificationVersion).toBe('v4');
    expect(model.specificationVersion).toBe('v4');
    expect(model.provider).toBe('typesafe.evaluation');
    expect(model.modelId).toBe('jev-latest');
    expect(model.supportedQuestionTypes).toEqual([
      'choice',
      'score',
      'boolean',
    ]);
  });

  it.each(['languageModel', 'embeddingModel', 'imageModel'] as const)(
    'rejects unsupported %s factories',
    factory => {
      expect(() => createTypeSafe()[factory]('unknown')).toThrow(
        NoSuchModelError,
      );
    },
  );
});
