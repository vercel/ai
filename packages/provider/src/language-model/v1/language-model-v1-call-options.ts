import { JSONSchema7 } from 'json-schema';
import { LanguageModelV1CallSettings } from './language-model-v1-call-settings';
import { LanguageModelV1FunctionTool } from './language-model-v1-function-tool';
import { LanguageModelV1Prompt } from './language-model-v1-prompt';
import { LanguageModelV1ProviderDefinedTool } from './language-model-v1-provider-defined-tool';
import { LanguageModelV1ProviderMetadata } from './language-model-v1-provider-metadata';
import { LanguageModelV1ToolChoice } from './language-model-v1-tool-choice';

export type LanguageModelV1CallOptions = LanguageModelV1CallSettings & {
  /**
Whether the user provided the input as messages or as
a prompt. This can help guide non-chat models in the
expansion, bc different expansions can be needed for
chat/non-chat use cases.
   */
  inputFormat: 'messages' | 'prompt';

  /**
The mode affects the behavior of the language model. It is required to
support provider-independent streaming and generation of structured objects.
The model can take this information and e.g. configure json mode, the correct
low level grammar, etc. It can also be used to optimize the efficiency of the
streaming, e.g. tool-delta stream parts are only needed in the
object-tool mode.

@deprecated mode will be removed in v2.
All necessary settings will be directly supported through the call settings,
in particular responseFormat, toolChoice, and tools.
   */
  mode:
    | {
        // stream text & complete tool calls
        type: 'regular';

        /**
The tools that are available for the model.
         */
        // TODO Spec V2: move to call settings
        tools?: Array<
          LanguageModelV1FunctionTool | LanguageModelV1ProviderDefinedTool
        >;

        /**
Specifies how the tool should be selected. Defaults to 'auto'.
         */
        // TODO Spec V2: move to call settings
        toolChoice?: LanguageModelV1ToolChoice;
      }
    | {
        // object generation with json mode enabled (streaming: text delta)
        type: 'object-json';

        /**
         * JSON schema that the generated output should conform to.
         */
        schema?: JSONSchema7;

        /**
         * Name of output that should be generated. Used by some providers for additional LLM guidance.
         */
        name?: string;

        /**
         * Description of the output that should be generated. Used by some providers for additional LLM guidance.
         */
        description?: string;
      }
    | {
        // object generation with tool mode enabled (streaming: tool call deltas)
        type: 'object-tool';
        tool: LanguageModelV1FunctionTool;
      };

  /**
A language mode prompt is a standardized prompt type.

Note: This is **not** the user-facing prompt. The AI SDK methods will map the
user-facing prompt types such as chat or instruction prompts to this format.
That approach allows us to evolve the user  facing prompts without breaking
the language model interface.
   */
  prompt: LanguageModelV1Prompt;

  /**
Additional provider-specific metadata.
The metadata is passed through to the provider from the AI SDK and enables
provider-specific functionality that can be fully encapsulated in the provider.
   */
  providerMetadata?: LanguageModelV1ProviderMetadata;
};
