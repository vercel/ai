import {
  applyPatch,
  codeInterpreter,
  fileSearch,
  imageGeneration,
  toolSearch,
  webSearch,
  webSearchPreview,
} from '@ai-sdk/openai/internal';

export const azureOpenaiTools: {
  applyPatch: typeof applyPatch;
  codeInterpreter: typeof codeInterpreter;
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
  fileSearch,
  imageGeneration,
  toolSearch,
  webSearch,
  webSearchPreview,
};
