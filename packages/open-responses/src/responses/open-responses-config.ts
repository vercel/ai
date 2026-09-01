import type { FetchFunction } from '@ai-sdk/provider-utils';
import type { OpenResponsesExtensionRegistry } from '../open-responses-extension';

export type OpenResponsesConfig = {
  provider: string;
  providerOptionsName: string;
  url: string;
  headers?: () => Record<string, string | undefined>;
  fetch?: FetchFunction;
  generateId: () => string;
  extensionRegistry?: OpenResponsesExtensionRegistry;
};
