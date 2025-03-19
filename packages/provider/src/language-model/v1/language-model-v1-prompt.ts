import { LanguageModelV1ProviderMetadata } from './language-model-v1-provider-metadata';

/**
A prompt is a list of messages.

Note: Not all models and prompt formats support multi-modal inputs and
tool calls. The validation happens at runtime.

Note: This is not a user-facing prompt. The AI SDK methods will map the
user-facing prompt types such as chat or instruction prompts to this format.
 */
export type LanguageModelV1Prompt = Array<LanguageModelV1Message>;

export type LanguageModelV1Message =
  // Note: there could be additional parts for each role in the future,
  // e.g. when the assistant can return images or the user can share files
  // such as PDFs.
  (
    | {
        role: 'system';
        content: string;
      }
    | {
        role: 'user';
        content: Array<
          | LanguageModelV1TextPart
          | LanguageModelV1ImagePart
          | LanguageModelV1FilePart
        >;
      }
    | {
        role: 'assistant';
        content: Array<
          | LanguageModelV1TextPart
          | LanguageModelV1FilePart
          | LanguageModelV1ReasoningPart
          | LanguageModelV1RedactedReasoningPart
          | LanguageModelV1ToolCallPart
        >;
      }
    | {
        role: 'tool';
        content: Array<LanguageModelV1ToolResultPart>;
      }
  ) & {
    /**
     * Additional provider-specific metadata. They are passed through
     * to the provider from the AI SDK and enable provider-specific
     * functionality that can be fully encapsulated in the provider.
     */
    providerMetadata?: LanguageModelV1ProviderMetadata;
  };

/**
Text content part of a prompt. It contains a string of text.
 */
export interface LanguageModelV1TextPart {
  type: 'text';

  /**
The text content.
   */
  text: string;

  /**
   * Additional provider-specific metadata. They are passed through
   * to the provider from the AI SDK and enable provider-specific
   * functionality that can be fully encapsulated in the provider.
   */
  providerMetadata?: LanguageModelV1ProviderMetadata;
}

/**
Reasoning content part of a prompt. It contains a string of reasoning text.
 */
export interface LanguageModelV1ReasoningPart {
  type: 'reasoning';

  /**
The reasoning text.
   */
  text: string;

  /**
An optional signature for verifying that the reasoning originated from the model.
   */
  signature?: string;

  /**
Additional provider-specific metadata. They are passed through
to the provider from the AI SDK and enable provider-specific
functionality that can be fully encapsulated in the provider.
   */
  providerMetadata?: LanguageModelV1ProviderMetadata;
}

/**
Redacted reasoning content part of a prompt.
 */
export interface LanguageModelV1RedactedReasoningPart {
  type: 'redacted-reasoning';

  /**
Redacted reasoning data.
   */
  data: string;

  /**
Additional provider-specific metadata. They are passed through
to the provider from the AI SDK and enable provider-specific
functionality that can be fully encapsulated in the provider.
   */
  providerMetadata?: LanguageModelV1ProviderMetadata;
}

/**
Image content part of a prompt. It contains an image.
 */
// TODO merge into file part in language model v2
export interface LanguageModelV1ImagePart {
  type: 'image';

  /**
Image data as a Uint8Array (e.g. from a Blob or Buffer) or a URL.
   */
  image: Uint8Array | URL;

  /**
Optional mime type of the image.
   */
  mimeType?: string;

  /**
   * Additional provider-specific metadata. They are passed through
   * to the provider from the AI SDK and enable provider-specific
   * functionality that can be fully encapsulated in the provider.
   */
  providerMetadata?: LanguageModelV1ProviderMetadata;
}

/**
File content part of a prompt. It contains a file.
 */
export interface LanguageModelV1FilePart {
  type: 'file';

  /**
   * Optional filename of the file.
   */
  filename?: string;

  /**
File data as base64 encoded string or as a URL.
   */
  // Note: base64-encoded strings are used to prevent
  // unnecessary conversions from string to buffer to string
  data: string | URL;

  /**
Mime type of the file.
   */
  mimeType: string;

  /**
   * Additional provider-specific metadata. They are passed through
   * to the provider from the AI SDK and enable provider-specific
   * functionality that can be fully encapsulated in the provider.
   */
  providerMetadata?: LanguageModelV1ProviderMetadata;
}

/**
Tool call content part of a prompt. It contains a tool call (usually generated by the AI model).
 */
export interface LanguageModelV1ToolCallPart {
  type: 'tool-call';

  /**
ID of the tool call. This ID is used to match the tool call with the tool result.
 */
  toolCallId: string;

  /**
Name of the tool that is being called.
 */
  toolName: string;

  /**
Arguments of the tool call. This is a JSON-serializable object that matches the tool's input schema.
   */
  args: unknown;

  /**
   * Additional provider-specific metadata. They are passed through
   * to the provider from the AI SDK and enable provider-specific
   * functionality that can be fully encapsulated in the provider.
   */
  providerMetadata?: LanguageModelV1ProviderMetadata;
}

/**
Tool result content part of a prompt. It contains the result of the tool call with the matching ID.
 */
export interface LanguageModelV1ToolResultPart {
  type: 'tool-result';

  /**
ID of the tool call that this result is associated with.
 */
  toolCallId: string;

  /**
Name of the tool that generated this result.
  */
  toolName: string;

  /**
Result of the tool call. This is a JSON-serializable object.
   */
  result: unknown;

  /**
Optional flag if the result is an error or an error message.
   */
  isError?: boolean;

  /**
Tool results as an array of parts. This enables advanced tool results including images.
When this is used, the `result` field should be ignored (if the provider supports content).
   */
  content?: Array<
    | {
        type: 'text';

        /**
Text content.
         */
        text: string;
      }
    | {
        type: 'image';

        /**
base-64 encoded image data
         */
        data: string;

        /**
Mime type of the image.
         */
        mimeType?: string;
      }
  >;

  /**
   * Additional provider-specific metadata. They are passed through
   * to the provider from the AI SDK and enable provider-specific
   * functionality that can be fully encapsulated in the provider.
   */
  providerMetadata?: LanguageModelV1ProviderMetadata;
}
