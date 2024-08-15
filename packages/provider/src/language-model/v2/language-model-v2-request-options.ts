import { JSONSchema7 } from 'json-schema';
import { LanguageModelV2FunctionTool } from './language-model-v2-function-tool';
import { LanguageModelV2Prompt } from './language-model-v2-prompt';
import { LanguageModelV2ToolChoice } from './language-model-v2-tool-choice';

export interface LanguageModelV2RequestOptions {
  /**
Whether the user provided the input as messages or as
a prompt. This can help guide non-chat models in the
expansion, bc different expansions can be needed for
chat/non-chat use cases.
 */
  inputFormat: 'messages' | 'prompt';

  /**
A language mode prompt is a standardized prompt type.

Note: This is **not** the user-facing prompt. The AI SDK methods will map the
user-facing prompt types such as chat or instruction prompts to this format.
That approach allows us to evolve the user  facing prompts without breaking
the language model interface.
*/
  prompt: LanguageModelV2Prompt;

  /**
The tools that are available for the model.
*/
  tools: Array<LanguageModelV2FunctionTool> | undefined;

  /**
Specifies how the tool should be selected. Defaults to 'auto'.
*/
  toolChoice: LanguageModelV2ToolChoice | undefined;

  /**
Maximum number of tokens to generate.
   */
  maxTokens: number | undefined;

  /**
Temperature setting.

It is recommended to set either `temperature` or `topP`, but not both.
 */
  temperature: number | undefined;

  /**
Stop sequences.
If set, the model will stop generating text when one of the stop sequences is generated.
Providers may have limits on the number of stop sequences.
 */
  stopSequences: string[] | undefined;

  /**
Nucleus sampling.

It is recommended to set either `temperature` or `topP`, but not both.
 */
  topP: number | undefined;

  /**
Only sample from the top K options for each subsequent token.

Used to remove "long tail" low probability responses.
Recommended for advanced use cases only. You usually only need to use temperature.
 */
  topK: number | undefined;

  /**
Presence penalty setting. It affects the likelihood of the model to
repeat information that is already in the prompt.
 */
  presencePenalty: number | undefined;

  /**
Frequency penalty setting. It affects the likelihood of the model
to repeatedly use the same words or phrases.
 */
  frequencyPenalty: number | undefined;

  /**
Response format. The output can either be text or JSON. Default is text.

If JSON is selected, a schema can optionally be provided to guide the LLM.
 */
  responseFormat:
    | {
        /**
         * The language model should return plain text.
         */
        type: 'text';
      }
    | {
        /**
         * The language model should return JSON.
         */
        type: 'json';

        /**
         * JSON schema that the generated output should conform to.
         */
        schema: JSONSchema7 | undefined;

        /**
         * Name of output that should be generated. Used by some providers for additional LLM guidance.
         */
        name: string | undefined;

        /**
         * Description of the output that should be generated. Used by some providers for additional LLM guidance.
         */
        description: string | undefined;
      }
    | undefined;

  /**
The seed (integer) to use for random sampling. If set and supported
by the model, calls will generate deterministic results.
 */
  seed: number | undefined;

  /**
Abort signal for cancelling the operation.
 */
  abortSignal: AbortSignal | undefined;

  /**
Additional HTTP headers to be sent with the request.
Only applicable for HTTP-based providers.
 */
  headers: Record<string, string | undefined> | undefined;
}
