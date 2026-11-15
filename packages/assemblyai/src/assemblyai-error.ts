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
    ]),
  ),
);

export type AssemblyAIErrorData = InferSchema<typeof assemblyaiErrorDataSchema>;

function assemblyaiErrorToMessage(data: AssemblyAIErrorData): string {
  return typeof data.error === 'string' ? data.error : data.error.message;
}

export const assemblyaiFailedResponseHandler = createJsonErrorResponseHandler({
  errorSchema: assemblyaiErrorDataSchema,
  errorToMessage: assemblyaiErrorToMessage,
});
