import { describe, expect, it } from 'vitest';
import {
  getStorageState,
  getTopModelForProvider,
  MODEL_PREFERENCE_TTL,
  resolveModel,
  selectModel,
} from './code-preview-preferences';

const now = 1_800_000_000_000;
const oldGrok = { id: 'xai/grok-4.6', provider: 'xai', name: 'Grok 4.6' };
const newGrok = { id: 'xai/grok-4.7', provider: 'xai', name: 'Grok 4.7' };
const defaultModel = {
  id: 'anthropic/claude-sonnet-4.5',
  provider: 'anthropic',
  name: 'Claude Sonnet 4.5',
};

describe('code preview preferences', () => {
  it('keeps the exact model until 24 hours, then follows its provider default', () => {
    const saved = selectModel(getStorageState(null), 'text', oldGrok, now);
    const resolveAt = (time: number) =>
      resolveModel({
        state: getStorageState(saved, time),
        kind: 'text',
        models: [newGrok, oldGrok, defaultModel],
        defaultModel,
      });

    expect(resolveAt(now + MODEL_PREFERENCE_TTL - 1)).toEqual(oldGrok);
    expect(resolveAt(now + MODEL_PREFERENCE_TTL)).toEqual(newGrok);
    expect(resolveAt(now + 365 * MODEL_PREFERENCE_TTL)).toEqual(newGrok);
    expect(getStorageState(saved, now + MODEL_PREFERENCE_TTL)).toEqual({
      providers: { text: 'xai' },
      models: {},
      tab: 'gateway',
    });
  });

  it('does not renew a model choice when restoring storage or changing tabs', () => {
    const saved = selectModel(getStorageState(null), 'text', oldGrok, now);
    const restored = getStorageState(saved, now + MODEL_PREFERENCE_TTL / 2);
    const switched = { ...restored, tab: 'provider' as const };

    expect(switched.models.text?.expiresAt).toBe(now + MODEL_PREFERENCE_TTL);
    expect(getStorageState(switched, now + MODEL_PREFERENCE_TTL)).toEqual({
      providers: { text: 'xai' },
      models: {},
      tab: 'provider',
    });
  });

  it('renews the lifetime only when a model is selected again', () => {
    const saved = selectModel(getStorageState(null), 'text', oldGrok, now);
    const selectedAgain = selectModel(
      saved,
      'text',
      oldGrok,
      now + MODEL_PREFERENCE_TTL / 2,
    );

    expect(
      getStorageState(selectedAgain, now + MODEL_PREFERENCE_TTL).models.text,
    ).toEqual({
      id: oldGrok.id,
      expiresAt: now + MODEL_PREFERENCE_TTL * 1.5,
    });
  });

  it('stores providers and expiration times independently for each model kind', () => {
    const text = selectModel(getStorageState(null), 'text', oldGrok, now);
    const image = selectModel(
      text,
      'image',
      { id: 'openai/gpt-image-1', provider: 'openai' },
      now + 1000,
    );
    const video = selectModel(
      image,
      'video',
      { id: 'google/veo-3.1-generate-001', provider: 'google' },
      now + 2000,
    );
    const restored = getStorageState(video, now + MODEL_PREFERENCE_TTL);

    expect(restored.providers).toEqual({
      text: 'xai',
      image: 'openai',
      video: 'google',
    });
    expect(restored.models.text).toBeUndefined();
    expect(restored.models.image?.expiresAt).toBe(
      now + 1000 + MODEL_PREFERENCE_TTL,
    );
    expect(restored.models.video?.expiresAt).toBe(
      now + 2000 + MODEL_PREFERENCE_TTL,
    );
  });

  it('updates the provider when selecting a model from another provider', () => {
    const saved = selectModel(getStorageState(null), 'text', oldGrok, now);
    const changed = selectModel(saved, 'text', defaultModel, now + 1000);

    expect(changed.providers.text).toBe('anthropic');
    expect(changed.models.text?.id).toBe(defaultModel.id);
    expect(saved.providers.text).toBe('xai');
  });

  it('preserves the provider from legacy single-model storage', () => {
    expect(
      getStorageState({ modelId: oldGrok.id, tab: 'provider' }, now),
    ).toEqual({ providers: { text: 'xai' }, models: {}, tab: 'provider' });
  });

  it('preserves providers from legacy per-kind storage without pinning models', () => {
    expect(
      getStorageState(
        {
          modelIds: {
            text: oldGrok.id,
            image: 'openai/gpt-image-1',
            video: 'google/veo-3.1-generate-001',
          },
          tab: 'custom',
        },
        now,
      ),
    ).toEqual({
      providers: { text: 'xai', image: 'openai', video: 'google' },
      models: {},
      tab: 'custom',
    });
  });

  it('uses the same provider when a saved model is no longer available', () => {
    expect(
      resolveModel({
        state: selectModel(getStorageState(null), 'text', oldGrok, now),
        kind: 'text',
        models: [newGrok, defaultModel],
        defaultModel,
      }),
    ).toEqual(newGrok);
  });

  it('honors updated preferred models after expiration', () => {
    const saved = selectModel(getStorageState(null), 'text', oldGrok, now);
    const options = {
      kind: 'text' as const,
      models: [oldGrok, newGrok, defaultModel],
      defaultModel,
      preferredModelIds: { xai: newGrok.id },
    };

    expect(
      resolveModel({ ...options, state: getStorageState(saved, now) }),
    ).toEqual(oldGrok);
    expect(
      resolveModel({
        ...options,
        state: getStorageState(saved, now + MODEL_PREFERENCE_TTL),
      }),
    ).toEqual(newGrok);
  });

  it('keeps the provider preference when that provider is temporarily unavailable', () => {
    const state = getStorageState({ providers: { text: 'xai' } }, now);
    expect(
      resolveModel({ state, kind: 'text', models: [], defaultModel }),
    ).toEqual(defaultModel);
    expect(
      resolveModel({ state, kind: 'text', models: [newGrok], defaultModel }),
    ).toEqual(newGrok);
    expect(state.providers.text).toBe('xai');
  });

  it('uses the example default when no preference was saved', () => {
    expect(
      resolveModel({
        state: getStorageState(null),
        kind: 'text',
        models: [newGrok, defaultModel],
        defaultModel,
      }),
    ).toEqual(defaultModel);
  });

  it('does not persist model choices with invalid expiration times', () => {
    for (const expiresAt of [NaN, Infinity, -Infinity]) {
      expect(
        getStorageState(
          { models: { text: { id: oldGrok.id, expiresAt } } },
          now,
        ),
      ).toEqual({ providers: { text: 'xai' }, models: {}, tab: 'gateway' });
    }
  });

  it('preserves the existing preference for GPT models when selecting OpenAI', () => {
    const reasoning = { id: 'openai/o3', provider: 'openai', name: 'o3' };
    const gpt = { id: 'openai/gpt-5', provider: 'openai', name: 'GPT-5' };

    expect(getTopModelForProvider([reasoning, gpt], 'text', 'openai')).toEqual(
      gpt,
    );
    expect(
      getTopModelForProvider([reasoning, gpt], 'text', 'openai', reasoning.id),
    ).toEqual(reasoning);
  });
});
