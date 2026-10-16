import {
  codeInterpreter,
  customTool,
  fileSearch,
  imageGeneration,
  webSearch,
  webSearchPreview,
} from '@ai-sdk/openai/internal';

export const azureOpenaiTools: {
  codeInterpreter: typeof codeInterpreter;
  customTool: typeof customTool;
  fileSearch: typeof fileSearch;
  imageGeneration: typeof imageGeneration;
  webSearch: typeof webSearch;
  webSearchPreview: typeof webSearchPreview;
} = {
  codeInterpreter,
  customTool,
  fileSearch,
  imageGeneration,
  webSearch,
  webSearchPreview,
};
