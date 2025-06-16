import { UIMessage } from './ui-messages';

export type PrepareRequest<UI_MESSAGE extends UIMessage> = (options: {
  id: string;
  messages: UI_MESSAGE[];
  requestMetadata: unknown;
  body: Record<string, any> | undefined;
  credentials: RequestCredentials | undefined;
  headers: HeadersInit | undefined;
}) => {
  body: object;
  headers?: HeadersInit;
  credentials?: RequestCredentials;
};
