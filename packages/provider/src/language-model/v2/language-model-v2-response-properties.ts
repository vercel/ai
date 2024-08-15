import { LanguageModelV2CallWarning } from './language-model-v2-call-warning';

/**
Common response properties for doStream and doGenerate.
 */
export interface LanguageModelV2ResponseProperties {
  /**
Optional raw response information for debugging purposes.
     */
  rawResponse?: {
    /**
Response headers.
    */
    headers?: Record<string, string>;
  };

  /**
Optional raw request for debugging purposes.
   */
  rawRequest?: {
    /**
Raw prompt after expansion and conversion to the format that the
provider uses to send the information to their API.
     */
    prompt: unknown;

    /**
Raw settings that are used for the API call. Includes provider-specific settings.
*/
    settings: Record<string, unknown>;

    /**
Request headers if the request is a HTTP request.
     */
    headers?: Record<string, string>;

    /**
Request body if the request is a HTTP request.
     */
    body?: string;
  };

  /**
A list of warnings that the model has generated. Warnings are indicators that the
prompt might not have been processed as expected, in particular if the model
does not support the request settings.
   */
  warnings?: LanguageModelV2CallWarning[];
}
