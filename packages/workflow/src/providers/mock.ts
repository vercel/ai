import { mockProvider } from './mock-function-wrapper.js';

export type MockResponseDescriptor =
  | { type: 'text'; text: string }
  | { type: 'tool-call'; toolName: string; input: string }
  | { type: 'error'; error: unknown };

/**
 * Mock model that returns a fixed text response.
 */
export function mockTextModel(text: string) {
  return mockProvider([{ type: 'text', text }]);
}

/**
 * Mock model that plays through a sequence of responses.
 * Determines which response to return by counting assistant messages in the prompt.
 */
export function mockSequenceModel(responses: MockResponseDescriptor[]) {
  return mockProvider(responses);
}
