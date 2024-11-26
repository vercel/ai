import {
  CallWarning,
  FinishReason,
  LanguageModelRequestMetadata,
  LanguageModelResponseMetadata,
  LogProbs,
  ProviderMetadata,
} from '../types';
import { LanguageModelUsage } from '../types/usage';

/**
The result of a `generateObject` call.
 */
export interface GenerateObjectResult<OBJECT> {
  /**
  The generated object (typed according to the schema).
     */
  readonly object: OBJECT;

  /**
  The reason why the generation finished.
     */
  readonly finishReason: FinishReason;

  /**
  The token usage of the generated text.
     */
  readonly usage: LanguageModelUsage;

  /**
  Warnings from the model provider (e.g. unsupported settings).
     */
  readonly warnings: CallWarning[] | undefined;

  /**
Additional request information.
   */
  readonly request: LanguageModelRequestMetadata;

  /**
Additional response information.
   */
  readonly response: LanguageModelResponseMetadata;

  /**
 Logprobs for the completion.
`undefined` if the mode does not support logprobs or if was not enabled.

@deprecated Will become a provider extension in the future.
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
