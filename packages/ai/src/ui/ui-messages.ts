import { DeepPartial } from '../util/deep-partial';
import { ValueOf } from '../util/value-of';

/**
The data types that can be used in the UI message for the UI message data parts.
 */
export type UIDataTypes = Record<string, unknown>;

export type UITools = Record<
  string,
  {
    input: unknown;
    output: unknown | undefined;
  }
>;

/**
AI SDK UI Messages. They are used in the client and to communicate between the frontend and the API routes.
 */
export interface UIMessage<
  METADATA = unknown,
  DATA_PARTS extends UIDataTypes = UIDataTypes,
  TOOLS extends UITools = UITools,
> {
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
  parts: Array<UIMessagePart<DATA_PARTS, TOOLS>>;
}

export type UIMessagePart<
  DATA_TYPES extends UIDataTypes,
  TOOLS extends UITools,
> =
  | TextUIPart
  | ReasoningUIPart
  | ToolUIPart<TOOLS>
  | SourceUrlUIPart
  | SourceDocumentUIPart
  | FileUIPart
  | DataUIPart<DATA_TYPES>
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
 * A source part of a message.
 */
export type SourceUrlUIPart = {
  type: 'source-url';
  sourceId: string;
  url: string;
  title?: string;
  providerMetadata?: Record<string, any>;
};

/**
 * A document source part of a message.
 */
export type SourceDocumentUIPart = {
  type: 'source-document';
  sourceId: string;
  mediaType: string;
  title: string;
  filename?: string;
  providerMetadata?: Record<string, any>;
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

export type DataUIPart<DATA_TYPES extends UIDataTypes> = ValueOf<{
  [NAME in keyof DATA_TYPES & string]: {
    type: `data-${NAME}`;
    id?: string;
    data: DATA_TYPES[NAME];
  };
}>;

export type ToolUIPart<TOOLS extends UITools = UITools> = ValueOf<{
  [NAME in keyof TOOLS & string]: {
    type: `tool-${NAME}`;
    toolCallId: string;
  } & (
    | {
        state: 'input-streaming';
        input: DeepPartial<TOOLS[NAME]['input']>;
      }
    | {
        state: 'input-available';
        input: TOOLS[NAME]['input'];
      }
    | {
        state: 'output-available';
        input: TOOLS[NAME]['input'];
        output: TOOLS[NAME]['output'];
      }
  );
}>;

export function isToolUIPart<TOOLS extends UITools>(
  part: UIMessagePart<UIDataTypes, TOOLS>,
): part is ToolUIPart<TOOLS> {
  return part.type.startsWith('tool-');
}

export function getToolName<TOOLS extends UITools>(
  part: ToolUIPart<TOOLS>,
): keyof TOOLS {
  return part.type.split('-')[1] as keyof TOOLS;
}

export type InferUIMessageMetadata<T extends UIMessage> =
  T extends UIMessage<infer METADATA> ? METADATA : unknown;

export type InferUIMessageData<T extends UIMessage> =
  T extends UIMessage<unknown, infer DATA_TYPES> ? DATA_TYPES : UIDataTypes;

export type InferUIMessageTools<T extends UIMessage> =
  T extends UIMessage<unknown, UIDataTypes, infer TOOLS> ? TOOLS : UITools;
