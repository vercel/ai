import type { ProviderV3, ProviderV4 } from '@ai-sdk/provider';
import type { DecisionProviderRegistry } from './provider-registry';

export { customProvider } from './custom-provider';
export { NoSuchProviderError } from './no-such-provider-error';
export {
  createProviderRegistry,
  experimental_createProviderRegistry,
} from './provider-registry';
export type { ProviderRegistryProvider } from './provider-registry';

export type { DecisionProviderRegistry as Experimental_DecisionProviderRegistry } from './provider-registry';

/** @deprecated Use `Experimental_DecisionProviderRegistry` instead. */
export type Experimental_EvaluationProviderRegistry<
  PROVIDERS extends Record<string, ProviderV4 | ProviderV3> = Record<
    string,
    ProviderV4 | ProviderV3
  >,
  SEPARATOR extends string = ':',
> = DecisionProviderRegistry<PROVIDERS, SEPARATOR>;
