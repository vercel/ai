/**
 * A prompt is a list of messages.
 *
 * Note: Not all models and prompt formats support multi-modal inputs and
 * tool calls. The validation happens at runtime.
 *
 * Note: This is not a user-facing prompt. The AI SDK methods will map the
 * user-facing prompt types such as chat or instruction prompts to this format.
 */
export type LanguageModelV1Prompt = Array<LanguageModelV1Message>;

export type LanguageModelV1Message =
  // Note: there could be additional parts for each role in the future,
  // e.g. when the assistant can return images or the user can share files
  // such as PDFs.
  | { role: 'system'; content: string } // can only come as 1st message
  | {
      role: 'user';
      content: Array<LanguageModelV1TextPart | LanguageModelV1ImagePart>;
    }
  | {
      role: 'assistant';
      content: Array<LanguageModelV1TextPart | LanguageModelV1ToolCallPart>;
    }
  | { role: 'tool'; content: Array<LanguageModelV1ToolResultPart> };

export interface LanguageModelV1TextPart {
  type: 'text';

  /**
   * The text content.
   */
  text: string;
}

export interface LanguageModelV1ImagePart {
  type: 'image';

  /**
   * Image data as a Uint8Array (e.g. from a Blob or Buffer) or a URL.
   */
  image: Uint8Array | URL;

  /**
   * Optional mime type of the image.
   */
  mimeType?: string;
}

export interface LanguageModelV1ToolCallPart {
  type: 'tool-call';

  toolCallId: string;
  toolName: string;

  args: unknown;
}

export interface LanguageModelV1ToolResultPart {
  type: 'tool-result';

  toolCallId: string;
  toolName: string;

  result: unknown;
}
