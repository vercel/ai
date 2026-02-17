import type { JSONValue } from '../../json-value/json-value';

/**
 * Data received from a webhook notification during asynchronous video
 * generation. Generic over the body type so providers/consumers can
 * narrow it to a specific shape.
 */
export type VideoModelV3Webhook<TBody = JSONValue> = {
  headers: Record<string, string>;
  body: TBody;
};
