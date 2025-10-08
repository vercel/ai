import {
  codeInterpreter,
  fileSearch,
  imageGeneration,
} from '@ai-sdk/openai/internal';

/**
 * Azure OpenAI tools are import from OOpenAI tools.
 */
export const azureOpenaiTools: {
  codeInterpreter: typeof codeInterpreter;
  fileSearch: typeof fileSearch;
  imageGeneration: typeof imageGeneration;
} = {
  codeInterpreter,
  fileSearch,
  imageGeneration,
};
