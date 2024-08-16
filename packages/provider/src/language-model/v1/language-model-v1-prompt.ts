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
  | {
      role: 'system';
      content: string;
      cacheControl?: {
        type: 'ephemeral';
      };
    }
  | {
      role: 'user';
      content: Array<LanguageModelV1TextPart | LanguageModelV1ImagePart>;
    }
  | {
      role: 'assistant';
      content: Array<LanguageModelV1TextPart | LanguageModelV1ToolCallPart>;
    }
  | {
      role: 'tool';
      content: Array<LanguageModelV1ToolResultPart>;
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
  cacheControl?: {
    type: 'ephemeral';
  };
}

/**
Image content part of a prompt. It contains an image.
 */
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

  cacheControl?: {
    type: 'ephemeral';
  };
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
}
