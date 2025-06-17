import { ProviderV2 } from '@ai-sdk/provider';

// add type of the global default provider variable to the globalThis object
declare global {
  var VERCEL_AI_GLOBAL_DEFAULT_PROVIDER: ProviderV2 | undefined;
}
