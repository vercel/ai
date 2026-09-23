export type TabType = 'gateway' | 'provider' | 'custom';
export type ModelKind = 'text' | 'image' | 'video';

export const MODEL_KINDS: ModelKind[] = ['text', 'image', 'video'];
export const MODEL_PREFERENCE_TTL = 24 * 60 * 60 * 1000;

export type StorageState = {
  providers: Partial<Record<ModelKind, string>>;
  models: Partial<Record<ModelKind, { id: string; expiresAt: number }>>;
  tab: TabType;
};

export type PersistedStorageState = Partial<StorageState> & {
  // Older versions stored model IDs without an expiration or provider.
  modelId?: string;
  modelIds?: Partial<Record<ModelKind, string>>;
};

export function getStorageState(
  state: PersistedStorageState | null,
  now = Date.now(),
): StorageState {
  const result: StorageState = {
    providers: {},
    models: {},
    tab:
      state?.tab === 'provider' || state?.tab === 'custom'
        ? state.tab
        : 'gateway',
  };

  for (const kind of MODEL_KINDS) {
    const model = state?.models?.[kind];
    const legacyModelId =
      kind === 'text' && state?.modelId
        ? state.modelId
        : state?.modelIds?.[kind];
    const modelId = model?.id ?? legacyModelId;
    const provider =
      state?.providers?.[kind] ??
      (typeof modelId === 'string' ? modelId.split('/')[0] : undefined);

    if (typeof provider === 'string' && provider) {
      result.providers[kind] = provider;
    }

    // Legacy model choices have no known age: retain only their provider.
    if (
      typeof model?.id === 'string' &&
      Number.isFinite(model.expiresAt) &&
      model.expiresAt > now
    ) {
      result.models[kind] = model;
    }
  }

  return result;
}

export function selectModel(
  state: StorageState,
  kind: ModelKind,
  model: { id: string; provider: string },
  now = Date.now(),
): StorageState {
  const current = getStorageState(state, now);
  return {
    ...current,
    providers: { ...current.providers, [kind]: model.provider },
    models: {
      ...current.models,
      [kind]: { id: model.id, expiresAt: now + MODEL_PREFERENCE_TTL },
    },
  };
}

export function getTopModelForProvider<
  Model extends { id: string; provider: string; name: string },
>(
  models: Model[],
  kind: ModelKind,
  provider: string,
  preferredId?: string,
): Model | undefined {
  const providerModels = models.filter(model => model.provider === provider);
  return (
    providerModels.find(model => model.id === preferredId) ??
    (kind === 'text' && provider === 'openai'
      ? providerModels.find(model => model.name.startsWith('GPT'))
      : undefined) ??
    providerModels[0]
  );
}

export function resolveModel<
  Model extends { id: string; provider: string; name: string },
>({
  state,
  kind,
  models,
  defaultModel,
  preferredModelIds,
}: {
  state: StorageState;
  kind: ModelKind;
  models: Model[];
  defaultModel: Model;
  preferredModelIds?: Record<string, string>;
}): Model {
  const provider = state.providers[kind];
  return (
    models.find(model => model.id === state.models[kind]?.id) ??
    (provider
      ? getTopModelForProvider(
          models,
          kind,
          provider,
          preferredModelIds?.[provider],
        )
      : undefined) ??
    defaultModel
  );
}
