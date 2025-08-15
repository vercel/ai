import { UIMessage } from './ui-messages';

export function validateUIMessages<UI_MESSAGE extends UIMessage>({
  messages,
}: {
  messages: unknown;
}): Array<UI_MESSAGE> {
  throw new Error('Not implemented');
}
