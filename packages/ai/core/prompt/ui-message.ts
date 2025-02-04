import {
  Attachment,
  ReasoningUIPart,
  TextUIPart,
  ToolInvocation,
  ToolInvocationUIPart,
} from '@ai-sdk/ui-utils';

/**
 * @internal
 */
export type InternalUIMessage = {
  role: 'system' | 'user' | 'assistant' | 'data';

  content: string;
  toolInvocations?: ToolInvocation[];
  experimental_attachments?: Attachment[];

  parts?: Array<TextUIPart | ReasoningUIPart | ToolInvocationUIPart>;
};
