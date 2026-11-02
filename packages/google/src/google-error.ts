import {
  createJsonErrorResponseHandler,
  type InferSchema,
  lazySchema,
  zodSchema,
} from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';

export const getGoogleErrorSchema = () =>
  z.object({
    code: z.number().nullable(),
    message: z.string(),
    status: z.string(),
    details: z.array(z.unknown()).nullish(),
  });

const googleErrorDataSchema = lazySchema(() =>
  zodSchema(
    z.object({
      error: getGoogleErrorSchema(),
    }),
  ),
);

export type GoogleErrorData = InferSchema<typeof googleErrorDataSchema>;

export const googleFailedResponseHandler = createJsonErrorResponseHandler({
  errorSchema: googleErrorDataSchema,
  errorToMessage: data => data.error.message,
});

// Google RPC status names can be sent without a numeric HTTP error code.
export function mapGoogleErrorStatusToHttpStatusCode(
  status: string,
): number | undefined {
  switch (status) {
    case 'CANCELLED':
      return 499;
    case 'INVALID_ARGUMENT':
    case 'FAILED_PRECONDITION':
    case 'OUT_OF_RANGE':
      return 400;
    case 'DEADLINE_EXCEEDED':
      return 504;
    case 'NOT_FOUND':
      return 404;
    case 'ALREADY_EXISTS':
    case 'ABORTED':
      return 409;
    case 'PERMISSION_DENIED':
      return 403;
    case 'UNAUTHENTICATED':
      return 401;
    case 'RESOURCE_EXHAUSTED':
      return 429;
    case 'UNIMPLEMENTED':
      return 501;
    case 'UNKNOWN':
    case 'INTERNAL':
    case 'DATA_LOSS':
      return 500;
    case 'UNAVAILABLE':
      return 503;
    default:
      return undefined;
  }
}
