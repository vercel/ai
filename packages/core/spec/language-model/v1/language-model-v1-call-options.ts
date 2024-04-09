import { JSONSchema7 } from 'json-schema';
import { LanguageModelV1CallSettings } from './language-model-v1-call-settings';
import { LanguageModelV1FunctionTool } from './language-model-v1-function-tool';
import { LanguageModelV1Prompt } from './language-model-v1-prompt';

export type LanguageModelV1CallOptions = LanguageModelV1CallSettings & {
  /**
   * Whether the user provided the input as messages or as
   * a prompt. This can help guide non-chat models in the
   * expansion, bc different expansions can be needed for
   * chat/non-chat use cases.
   */
  inputFormat: 'messages' | 'prompt';

  /**
   * The mode affects the behavior of the language model. It is required to
   * support provider-independent streaming and generation of structured objects.
   * The model can take this information and e.g. configure json mode, the correct
   * low level grammar, etc. It can also be used to optimize the efficiency of the
   * streaming, e.g. tool-delta stream parts are only needed in the
   * object-tool mode.
   */
  mode:
    | {
        // stream text & complete tool calls
        type: 'regular';
        tools?: Array<LanguageModelV1FunctionTool>;
      }
    | {
        // object generation with json mode enabled (streaming: text delta)
        type: 'object-json';
      }
    | {
        // object generation with grammar enabled (streaming: text delta)
        type: 'object-grammar';
        schema: JSONSchema7;
      }
    | {
        // object generation with tool mode enabled (streaming: tool call deltas)
        type: 'object-tool';
        tool: LanguageModelV1FunctionTool;
      };

  /**
   * A language mode prompt is a standardized prompt type.
   *
   * Note: This is **not** the user-facing prompt. The AI SDK methods will map the
   * user-facing prompt types such as chat or instruction prompts to this format.
   * That approach allows us to evolve the user  facing prompts without breaking
   * the language model interface.
   */
  prompt: LanguageModelV1Prompt;
};
