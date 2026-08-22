import {
  applyPatch,
  codeInterpreter,
  fileSearch,
  imageGeneration,
  webSearch,
  webSearchPreview,
} from '@ai-sdk/openai/internal';

export const azureOpenaiTools: {
  applyPatch: typeof applyPatch;
  codeInterpreter: typeof codeInterpreter;
  fileSearch: typeof fileSearch;
  imageGeneration: typeof imageGeneration;
  webSearch: typeof webSearch;
  webSearchPreview: typeof webSearchPreview;
} = {
  applyPatch,
  codeInterpreter,
  fileSearch,
  imageGeneration,
  webSearch,
  webSearchPreview,
};
