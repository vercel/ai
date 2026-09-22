import type { APICallError } from '@ai-sdk/provider';
import type { FetchFunction, ResponseHandler } from '@ai-sdk/provider-utils';
import type { OpenResponsesExtensionRegistry } from '../open-responses-extension';

export type OpenResponsesConfig = {
  provider: string;
  providerOptionsName: string;
  url: string;
  headers?: () => Record<string, string | undefined>;
  fetch?: FetchFunction;
  failedResponseHandler?: ResponseHandler<APICallError>;
  generateId: () => string;
  extensionRegistry?: OpenResponsesExtensionRegistry;
  strictResponseInput?: boolean;
  customToolId?: `${string}.${string}`;
  reasoningReplay?: 'full' | 'id-and-summary';
  structuredOutputs?: boolean;
  supportedReasoningEfforts?: readonly string[];
  supportedReasoningSummaries?: readonly string[];
};
