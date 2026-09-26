import type { APICallError } from '@ai-sdk/provider';
import type { FetchFunction, ResponseHandler } from '@ai-sdk/provider-utils';
import type { OpenResponsesExtensionRegistry } from '../open-responses-extension';
import type { ResponseError } from './open-responses-api';

export type OpenResponsesConfig = {
  provider: string;
  providerOptionsName: string;
  url: string;
  headers?: () => Record<string, string | undefined>;
  fetch?: FetchFunction;
  failedResponseHandler?: ResponseHandler<APICallError>;
  getResponseErrorMetadata?: (error: ResponseError) => {
    statusCode?: number;
    isRetryable?: boolean;
  };
  generateId: () => string;
  extensionRegistry?: OpenResponsesExtensionRegistry;
  strictResponseInput?: boolean;
  customToolId?: `${string}.${string}`;
  structuredOutputs?: boolean;
};
