import { describe, expect, it } from 'vitest';
import { resolveACPModelId } from './resolve-acp-model-id';

const configOptionMapping = {
  type: 'session-config-option',
  path: 'model',
} as const;

const sessionModelMapping = {
  type: 'session-model',
  path: 'modelId',
} as const;

describe('resolveACPModelId', () => {
  it('reads the config option matching the mapping path', () => {
    expect(
      resolveACPModelId({
        sessionState: {
          sessionId: 'session-1',
          configOptions: [
            {
              type: 'select',
              id: 'other',
              category: 'model',
              currentValue: 'other-model',
            },
            { type: 'select', id: 'model', currentValue: 'mapped-model' },
          ],
        },
        modelMapping: configOptionMapping,
      }),
    ).toBe('mapped-model');
  });

  it('falls back to the config option with the model category', () => {
    expect(
      resolveACPModelId({
        sessionState: {
          configOptions: [
            { type: 'select', id: 'mode', currentValue: 'agent' },
            {
              type: 'select',
              id: 'model-picker',
              category: 'model',
              currentValue: 'category-model',
            },
          ],
        },
        modelMapping: configOptionMapping,
      }),
    ).toBe('category-model');
  });

  it('prefers config options over models.currentModelId for config option mappings', () => {
    expect(
      resolveACPModelId({
        sessionState: {
          models: { currentModelId: 'session-model' },
          configOptions: [
            { type: 'select', id: 'model', currentValue: 'config-model' },
          ],
        },
        modelMapping: configOptionMapping,
      }),
    ).toBe('config-model');
  });

  it('falls back to models.currentModelId for config option mappings', () => {
    expect(
      resolveACPModelId({
        sessionState: { models: { currentModelId: 'session-model' } },
        modelMapping: configOptionMapping,
      }),
    ).toBe('session-model');
  });

  it('prefers models.currentModelId for session model mappings', () => {
    expect(
      resolveACPModelId({
        sessionState: {
          models: { currentModelId: 'session-model' },
          configOptions: [
            {
              type: 'select',
              id: 'model',
              category: 'model',
              currentValue: 'config-model',
            },
          ],
        },
        modelMapping: sessionModelMapping,
      }),
    ).toBe('session-model');
  });

  it('falls back to the model category config option for session model mappings', () => {
    expect(
      resolveACPModelId({
        sessionState: {
          configOptions: [
            {
              type: 'select',
              id: 'model',
              category: 'model',
              currentValue: 'config-model',
            },
          ],
        },
        modelMapping: sessionModelMapping,
      }),
    ).toBe('config-model');
  });

  it('ignores boolean options and empty values', () => {
    expect(
      resolveACPModelId({
        sessionState: {
          models: { currentModelId: '' },
          configOptions: [
            {
              type: 'boolean',
              id: 'model',
              category: 'model',
              currentValue: true,
            },
            {
              type: 'select',
              id: 'other',
              category: 'model',
              currentValue: '',
            },
          ],
        },
        modelMapping: configOptionMapping,
      }),
    ).toBeUndefined();
  });

  it('returns undefined for responses without model state', () => {
    expect(
      resolveACPModelId({
        sessionState: { sessionId: 'session-1' },
        modelMapping: configOptionMapping,
      }),
    ).toBeUndefined();
    expect(
      resolveACPModelId({
        sessionState: null,
        modelMapping: undefined,
      }),
    ).toBeUndefined();
  });
});
