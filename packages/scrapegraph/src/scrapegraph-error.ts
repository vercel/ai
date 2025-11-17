import { createJsonErrorResponseHandler } from '@ai-sdk/provider-utils';
import { z } from 'zod';

const scrapeGraphErrorDataSchema = z.object({
  error: z.object({
    message: z.string(),
    type: z.string().optional(),
    code: z.string().optional(),
  }),
});

export type ScrapeGraphErrorData = z.infer<typeof scrapeGraphErrorDataSchema>;

export const scrapeGraphFailedResponseHandler = createJsonErrorResponseHandler({
  errorSchema: scrapeGraphErrorDataSchema,
  errorToMessage: data => data.error.message,
});

