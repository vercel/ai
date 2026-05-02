import {
  codeInterpreter,
  fileSearch,
  imageGeneration,
  shell,
  webSearchPreview,
} from '@ai-sdk/openai/internal';

export const azureOpenaiTools: {
  codeInterpreter: typeof codeInterpreter;
  fileSearch: typeof fileSearch;
  imageGeneration: typeof imageGeneration;
  shell: typeof shell;
  webSearchPreview: typeof webSearchPreview;
} = {
  codeInterpreter,
  fileSearch,
  imageGeneration,
  shell,
  webSearchPreview,
};
