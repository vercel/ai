import { z } from 'zod/v4';
import {
  lazySchema,
  zodSchema,
  type InferSchema,
  createJsonErrorResponseHandler,
} from '@ai-sdk/provider-utils';

/**
 * AssemblyAI documents a flat error shape for 4xx/5xx responses:
 * `{ "error": "Invalid API key", "status": "error" }`.
 *
 * Previously supported nested shape, kept for backward compatibility:
 * `{ "error": { "message": "...", "code": 429 } }`.
 *
 * The temporary token API (used for streaming) responds with
 * `{ "detail": "Invalid API key" }`, or a list of validation messages.
 */
export const assemblyaiErrorDataSchema = lazySchema(() =>
  zodSchema(
    z.union([
      z.object({
        error: z.string(),
      }),
      z.object({
        error: z.object({
          message: z.string(),
          code: z.number(),
        }),
      }),
      z.object({
        detail: z.union([
          z.string(),
          z.array(z.union([z.string(), z.object({ msg: z.string() })])),
        ]),
      }),
    ]),
  ),
);

export type AssemblyAIErrorData = InferSchema<typeof assemblyaiErrorDataSchema>;

function assemblyaiErrorToMessage(data: AssemblyAIErrorData): string {
  if ('detail' in data) {
    return typeof data.detail === 'string'
      ? data.detail
      : data.detail
          .map(entry => (typeof entry === 'string' ? entry : entry.msg))
          .join('; ');
  }
  return typeof data.error === 'string' ? data.error : data.error.message;
}

export const assemblyaiFailedResponseHandler = createJsonErrorResponseHandler({
  errorSchema: assemblyaiErrorDataSchema,
  errorToMessage: assemblyaiErrorToMessage,
});
