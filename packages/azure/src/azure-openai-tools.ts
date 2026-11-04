import {
  codeInterpreter,
  customTool,
  fileSearch,
  imageGeneration,
  toolSearch,
  webSearch,
  webSearchPreview,
} from '@ai-sdk/openai/internal';

export const azureOpenaiTools: {
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
  codeInterpreter,
  customTool,
  fileSearch,
  imageGeneration,
  toolSearch,
  webSearch,
  webSearchPreview,
};
