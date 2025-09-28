import { codeInterpreter, fileSearch,imageGeneration } from '@ai-sdk/openai/internal';

export const azureOpenaiTools: {
  codeInterpreter: typeof codeInterpreter;
  fileSearch: typeof fileSearch;
  imageGeneration: typeof imageGeneration;
} = {
  codeInterpreter,
  fileSearch,
  imageGeneration,
};
