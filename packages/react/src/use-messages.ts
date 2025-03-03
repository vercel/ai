import { Schema } from '@ai-sdk/ui-utils';
import { z } from 'zod';

type FlexibleSchema = z.ZodTypeAny | Schema<any>;

export type inferFlexibleSchema<PARAMETERS extends FlexibleSchema> =
  PARAMETERS extends Schema<any>
    ? PARAMETERS['_type']
    : PARAMETERS extends z.ZodTypeAny
    ? z.infer<PARAMETERS>
    : never;

export type InDevelopment_Content<
  DATA_CONTENT extends Record<string, FlexibleSchema>,
> = InDevelopment_TextContent | InDevelopment_DataContent<DATA_CONTENT>;

export type InDevelopment_TextContent = {
  type: 'text';
  text: string;
  node: React.ReactNode;
};

export type InDevelopment_DataContent<
  DATA_CONTENT extends Record<string, FlexibleSchema>,
> = {
  type: 'data';
  dataContentType: keyof DATA_CONTENT;
  data: DATA_CONTENT[keyof DATA_CONTENT]['_type'];
  node: React.ReactNode;
};

export type InDevelopment_UIMessage<
  METADATA,
  DATA_CONTENT extends Record<string, FlexibleSchema>,
> = {
  id: string;
  // TODO should we include a role?
  metadata: METADATA;

  content: InDevelopment_Content<DATA_CONTENT>[];
  contentNodes: React.ReactNode[];
};

export function inDevelopment_useMessages<
  MESSAGE_METADATA extends FlexibleSchema,
  MESSAGE_DATA_CONTENT extends Record<string, FlexibleSchema>,
>({
  messageMetadata,
  messageDataContent,
}: {
  messageMetadata: MESSAGE_METADATA;
  messageDataContent: MESSAGE_DATA_CONTENT;
  renderTextContent?: (
    textContent: InDevelopment_TextContent,
  ) => React.ReactNode;
  renderDataContent: {
    [K in keyof MESSAGE_DATA_CONTENT]: (
      content: InDevelopment_DataContent<{
        [key: string]: MESSAGE_DATA_CONTENT[K];
      }>,
    ) => React.ReactNode;
  };
}): {
  messages: Array<
    InDevelopment_UIMessage<
      inferFlexibleSchema<MESSAGE_METADATA>,
      MESSAGE_DATA_CONTENT
    >
  >;
} {
  return {
    messages: [],
  };
}
