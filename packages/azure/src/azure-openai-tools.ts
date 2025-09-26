import { codeInterpreter, fileSearch } from '@ai-sdk/openai/internal';

export const azureOpenaiTools: {
  codeInterpreter: typeof codeInterpreter;
  fileSearch: typeof fileSearch;
} = {
  codeInterpreter,
  fileSearch,
};
