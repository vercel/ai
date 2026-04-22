import {
  codeInterpreter,
  fileSearch,
  imageGeneration,
  toolSearch,
  webSearchPreview,
} from '@ai-sdk/openai/internal';

export const azureOpenaiTools: {
  codeInterpreter: typeof codeInterpreter;
  fileSearch: typeof fileSearch;
  imageGeneration: typeof imageGeneration;
  toolSearch: typeof toolSearch;
  webSearchPreview: typeof webSearchPreview;
} = {
  codeInterpreter,
  fileSearch,
  imageGeneration,
  toolSearch,
  webSearchPreview,
};
