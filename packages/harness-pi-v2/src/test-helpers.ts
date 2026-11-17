import {
  createModels,
  fauxProvider,
  type FauxProviderHandle,
} from '@earendil-works/pi-ai';
import type { PiModelRuntime } from './pi-model-runtime';

/**
 * Faux model access for adapter tests: scripted responses instead of AI
 * Gateway requests.
 */
export type TestModelRuntime = PiModelRuntime & {
  /**
   * Faux provider whose responses the test scripts.
   */
  faux: FauxProviderHandle;
};

/**
 * Creates a model runtime backed by Pi's faux provider. Every model ID
 * resolves to the faux model.
 */
export function createTestModelRuntime(): TestModelRuntime {
  const faux = fauxProvider();
  const models = createModels();
  models.setProvider(faux.provider);
  return {
    faux,
    resolveModel: () => faux.getModel(),
    streamFn: (model, context, options) =>
      models.streamSimple(model, context, options),
  };
}
