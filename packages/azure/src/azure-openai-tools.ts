import {
  codeInterpreter,
  customTool,
  fileSearch,
  imageGeneration,
  webSearchPreview,
} from '@ai-sdk/openai/internal';

export const azureOpenaiTools: {
  codeInterpreter: typeof codeInterpreter;
  customTool: typeof customTool;
  fileSearch: typeof fileSearch;
  imageGeneration: typeof imageGeneration;
  webSearchPreview: typeof webSearchPreview;
} = {
  codeInterpreter,
  customTool,
  fileSearch,
  imageGeneration,
  webSearchPreview,
};
