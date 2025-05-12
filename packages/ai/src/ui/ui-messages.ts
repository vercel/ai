import { LanguageModelV2Source } from '@ai-sdk/provider';
import { ToolCall, ToolResult } from '@ai-sdk/provider-utils';

/**
Tool invocations are either tool calls or tool results. For each assistant tool call,
there is one tool invocation. While the call is in progress, the invocation is a tool call.
Once the call is complete, the invocation is a tool result.

The step is used to track how to map an assistant UI message with many tool invocations
back to a sequence of LLM assistant/tool result message pairs.
It is optional for backwards compatibility.
 */
export type ToolInvocation =
  | ({ state: 'partial-call'; step?: number } & ToolCall<string, any>)
  | ({ state: 'call'; step?: number } & ToolCall<string, any>)
  | ({ state: 'result'; step?: number } & ToolResult<string, any, any>);

/**
 * AI SDK UI Messages. They are used in the client and to communicate between the frontend and the API routes.
 */
export interface UIMessage<METADATA = unknown> {
  /**
A unique identifier for the message.
   */
  id: string;

  /**
The role of the message.
   */
  role: 'system' | 'user' | 'assistant';

  /**
The metadata of the message.
   */
  metadata?: METADATA;

  /**
The parts of the message. Use this for rendering the message in the UI.

System messages should be avoided (set the system prompt on the server instead).
They can have text parts.

User messages can have text parts and file parts.

Assistant messages can have text, reasoning, tool invocation, and file parts.
   */
  parts: Array<UIMessagePart>;
}

export type UIMessagePart =
  | TextUIPart
  | ReasoningUIPart
  | ToolInvocationUIPart
  | SourceUIPart
  | FileUIPart
  | StepStartUIPart;

/**
 * A text part of a message.
 */
export type TextUIPart = {
  type: 'text';

  /**
   * The text content.
   */
  text: string;
};

/**
 * A reasoning part of a message.
 */
export type ReasoningUIPart = {
  type: 'reasoning';

  /**
   * The reasoning text.
   */
  text: string;

  /**
   * The provider metadata.
   */
  providerMetadata?: Record<string, any>;
};

/**
 * A tool invocation part of a message.
 */
export type ToolInvocationUIPart = {
  type: 'tool-invocation';

  /**
   * The tool invocation.
   */
  toolInvocation: ToolInvocation;
};

/**
 * A source part of a message.
 */
export type SourceUIPart = {
  type: 'source';

  /**
   * The source.
   */
  source: LanguageModelV2Source;
};

/**
 * A file part of a message.
 */
export type FileUIPart = {
  type: 'file';

  /**
   * IANA media type of the file.
   *
   * @see https://www.iana.org/assignments/media-types/media-types.xhtml
   */
  mediaType: string;

  /**
   * Optional filename of the file.
   */
  filename?: string;

  /**
   * The URL of the file.
   * It can either be a URL to a hosted file or a [Data URL](https://developer.mozilla.org/en-US/docs/Web/HTTP/Basics_of_HTTP/Data_URLs).
   */
  url: string;
};

/**
 * A step boundary part of a message.
 */
export type StepStartUIPart = {
  type: 'step-start';
};

export type CreateUIMessage<METADATA = unknown> = Omit<
  UIMessage<METADATA>,
  'id'
> & {
  id?: UIMessage<METADATA>['id'];
};
