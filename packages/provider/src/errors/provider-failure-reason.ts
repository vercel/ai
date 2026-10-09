/**
 * Why a provider rejected a request, when the provider adapter recognizes the
 * rejection. Set on `APICallError` and on errors reported after a stream has
 * started.
 *
 * - `context-length-exceeded`: the input plus the reserved output tokens
 *   exceed the model's context window. Retrying the same request will not
 *   succeed; shortening the input or lowering `maxOutputTokens` may.
 */
export type ProviderFailureReason = 'context-length-exceeded';
