import {
  codeInterpreter,
  fileSearch,
  imageGeneration,
  shell,
  webSearch,
  webSearchPreview,
} from '@ai-sdk/openai/internal';

export const azureOpenaiTools: {
  codeInterpreter: typeof codeInterpreter;
  fileSearch: typeof fileSearch;
  imageGeneration: typeof imageGeneration;
  shell: typeof shell;
  webSearch: typeof webSearch;
  webSearchPreview: typeof webSearchPreview;
} = {
  codeInterpreter,
  fileSearch,
  imageGeneration,
  shell,
  webSearch,
  webSearchPreview,
};
