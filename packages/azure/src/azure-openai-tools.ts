import {
  codeInterpreter,
  fileSearch,
  imageGeneration,
  localShell,
  shell,
  webSearchPreview,
} from '@ai-sdk/openai/internal';

export const azureOpenaiTools: {
  codeInterpreter: typeof codeInterpreter;
  fileSearch: typeof fileSearch;
  imageGeneration: typeof imageGeneration;
  localShell: typeof localShell;
  shell: typeof shell;
  webSearchPreview: typeof webSearchPreview;
} = {
  codeInterpreter,
  fileSearch,
  imageGeneration,
  localShell,
  shell,
  webSearchPreview,
};
