import { NoSuchModelError } from '@ai-sdk/provider';
import { describe, expect, it } from 'vitest';
import { createTypeSafeAi, typeSafeAi } from './typesafe-ai-provider';

describe('TypeSafe provider', () => {
  it('provides the experimental decision capability', () => {
    const model = typeSafeAi.decisionModel('jev-latest');
    expect(typeSafeAi.specificationVersion).toBe('v4');
    expect(model.specificationVersion).toBe('v4');
    expect(model.provider).toBe('typesafe.decision');
    expect(model.modelId).toBe('jev-latest');
    expect(model.supportedQuestionTypes).toEqual([
      'choice',
      'score',
      'boolean',
    ]);
  });

  it('retains the deprecated factory alias', () => {
    expect(typeSafeAi.evaluationModel).toBe(typeSafeAi.decisionModel);
    expect(typeSafeAi.evaluationModel('jev-latest').provider).toBe(
      'typesafe.decision',
    );
  });

  it.each(['languageModel', 'embeddingModel', 'imageModel'] as const)(
    'rejects unsupported %s factories',
    factory => {
      expect(() => createTypeSafeAi()[factory]('unknown')).toThrow(
        NoSuchModelError,
      );
    },
  );
});
