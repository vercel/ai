import { UIDataTypes, UIMessage } from './ui-messages';

export type PrepareRequest<
  MESSAGE_METADATA,
  DATA_TYPES extends UIDataTypes,
> = (options: {
  id: string;
  messages: UIMessage<MESSAGE_METADATA, DATA_TYPES>[];
  requestMetadata: unknown;
  body: Record<string, any> | undefined;
  credentials: RequestCredentials | undefined;
  headers: HeadersInit | undefined;
}) => {
  body: object;
  headers?: HeadersInit;
  credentials?: RequestCredentials;
};
