import {
  codeInterpreter,
  fileSearch,
  imageGeneration,
  shell,
  toolSearch,
  webSearch,
  webSearchPreview,
} from '@ai-sdk/openai/internal';

export const azureOpenaiTools: {
  codeInterpreter: typeof codeInterpreter;
  fileSearch: typeof fileSearch;
  imageGeneration: typeof imageGeneration;
  shell: typeof shell;
  toolSearch: typeof toolSearch;
  webSearch: typeof webSearch;
  /**
   * @deprecated Use `webSearch` instead.
   */
  webSearchPreview: typeof webSearchPreview;
} = {
  codeInterpreter,
  fileSearch,
  imageGeneration,
  shell,
  toolSearch,
  webSearch,
  webSearchPreview,
};
