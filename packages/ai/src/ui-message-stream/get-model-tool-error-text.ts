import { getErrorMessage } from '@ai-sdk/provider';

/**
 * Returns the error text that the model receives for a failed tool call (see
 * `createToolModelOutput` with `errorMode: 'text'`), or `undefined` when the
 * error cannot be serialized. In that case the model did not receive an error
 * text either, because creating the tool result fails the same way.
 */
export function getModelToolErrorText(error: unknown): string | undefined {
  try {
    return getErrorMessage(error);
  } catch {
    return undefined;
  }
}
