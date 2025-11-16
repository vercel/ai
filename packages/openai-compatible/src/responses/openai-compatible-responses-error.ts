import { ProviderErrorStructure } from '../openai-compatible-error';
import {
  OpenAICompatibleResponsesErrorData,
  openaiCompatibleResponsesErrorDataSchema,
} from './openai-compatible-responses-api';

export const defaultOpenAICompatibleResponsesErrorStructure: ProviderErrorStructure<OpenAICompatibleResponsesErrorData> =
  {
    errorSchema: openaiCompatibleResponsesErrorDataSchema,
    errorToMessage: data => data.message,
  };
