import {
  CallWarning,
  FinishReason,
  LogProbs,
  ProviderMetadata,
} from '../types';
import { CompletionTokenUsage } from '../types/token-usage';

/**
The result of a `generateObject` call.
 */
export interface GenerateObjectResult<T> {
  /**
  The generated object (typed according to the schema).
     */
  readonly object: T;

  /**
  The reason why the generation finished.
     */
  readonly finishReason: FinishReason;

  /**
  The token usage of the generated text.
     */
  readonly usage: CompletionTokenUsage;

  /**
  Warnings from the model provider (e.g. unsupported settings)
     */
  readonly warnings: CallWarning[] | undefined;

  /**
  Optional raw response data.
     */
  readonly rawResponse?: {
    /**
  Response headers.
   */
    headers?: Record<string, string>;
  };

  /**
  Logprobs for the completion.
  `undefined` if the mode does not support logprobs or if was not enabled
     */
  readonly logprobs: LogProbs | undefined;

  /**
Additional provider-specific metadata. They are passed through
from the provider to the AI SDK and enable provider-specific
results that can be fully encapsulated in the provider.
   */
  readonly experimental_providerMetadata: ProviderMetadata | undefined;

  /**
  Converts the object to a JSON response.
  The response will have a status code of 200 and a content type of `application/json; charset=utf-8`.
     */
  toJsonResponse(init?: ResponseInit): Response;
}
