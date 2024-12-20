import { z } from "zod";
import { createJsonErrorResponseHandler } from "@ai-sdk/provider-utils";

export const friendliAIErrorDataSchema = z.object({
  error: z.object({
    message: z.string(),

    // The additional information below is handled loosely to support
    // FriendliAI-compatible providers that have slightly different error
    // responses:
    type: z.string().nullish(),
    param: z.any().nullish(),
    code: z.union([z.string(), z.number()]).nullish(),
  }),
});

export type FriendliAIErrorData = z.infer<typeof friendliAIErrorDataSchema>;

export const friendliaiFailedResponseHandler = createJsonErrorResponseHandler({
  errorSchema: friendliAIErrorDataSchema,
  errorToMessage: (data) => data.error.message,
});
