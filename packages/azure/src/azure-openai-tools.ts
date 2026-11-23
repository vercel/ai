import {
  applyPatch,
  codeInterpreter,
  customTool,
  fileSearch,
  imageGeneration,
  shell,
  toolSearch,
  webSearch,
  webSearchPreview,
} from '@ai-sdk/openai/internal';

export const azureOpenaiTools: {
  applyPatch: typeof applyPatch;
  codeInterpreter: typeof codeInterpreter;
  customTool: typeof customTool;
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
  applyPatch,
  codeInterpreter,
  customTool,
  fileSearch,
  imageGeneration,
  shell,
  toolSearch,
  webSearch,
  webSearchPreview,
};
