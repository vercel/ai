import { createJsonErrorResponseHandler } from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';

const apiErrorSchema = z.object({
  error: z.object({
    message: z.string(),
    type: z.string().nullish(),
    param: z.any().nullish(),
    code: z.union([z.string(), z.number()]).nullish(),
  }),
});

const responsesErrorSchema = z.object({
  code: z.string(),
  error: z.string(),
});

// Text to Speech error shape, e.g. {"error":"speed must be between 0.7 and 1.5"}
const speechErrorSchema = z.object({
  error: z.string(),
});

export const xaiErrorDataSchema = z.union([
  apiErrorSchema,
  responsesErrorSchema,
  speechErrorSchema,
]);

export type XaiErrorData = z.infer<typeof xaiErrorDataSchema>;

export const xaiFailedResponseHandler =
  /* @__PURE__ */ createJsonErrorResponseHandler({
    errorSchema: xaiErrorDataSchema,
    errorToMessage: data => {
      if (typeof data.error === 'string') {
        return 'code' in data ? `${data.code}: ${data.error}` : data.error;
      }
      return data.error.message;
    },
  });
