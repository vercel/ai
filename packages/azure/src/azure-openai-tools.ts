import {
  applyPatch,
  codeInterpreter,
  customTool,
  fileSearch,
  imageGeneration,
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
  toolSearch,
  webSearch,
  webSearchPreview,
};
