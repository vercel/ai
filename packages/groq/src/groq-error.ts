import { createJsonErrorResponseHandler } from '@ai-sdk/provider-utils';
import { Static, Type } from 'typebox';
import { typeboxValidator } from './typebox-validator';

export const groqErrorDataSchema = Type.Object({
  error: Type.Object({
    message: Type.String(),
    type: Type.String(),
  }),
});

export type GroqErrorData = Static<typeof groqErrorDataSchema>;

export const groqFailedResponseHandler = createJsonErrorResponseHandler({
  errorSchema: typeboxValidator<GroqErrorData>(groqErrorDataSchema),
  errorToMessage: data => data.error.message,
});
