import type { FetchFunction } from '@ai-sdk/provider-utils';

export type OpenResponsesConfig = {
  provider: string;
  providerOptionsName: string;
  url: string;
  headers: () => Record<string, string | undefined>;
  fetch?: FetchFunction;
  generateId: () => string;
<<<<<<< HEAD
=======
  extensionRegistry?: OpenResponsesExtensionRegistry;
  strictResponseInput?: boolean;
>>>>>>> 4210d0b502 (feat(open-responses): add strict assistant history serialization without synthetic item IDs (#20376))
};
