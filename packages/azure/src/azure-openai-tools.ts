import {
  applyPatch,
  codeInterpreter,
  fileSearch,
  imageGeneration,
  webSearchPreview,
} from '@ai-sdk/openai/internal';

export const azureOpenaiTools: {
  applyPatch: typeof applyPatch;
  codeInterpreter: typeof codeInterpreter;
  fileSearch: typeof fileSearch;
  imageGeneration: typeof imageGeneration;
  webSearchPreview: typeof webSearchPreview;
} = {
  applyPatch,
  codeInterpreter,
  fileSearch,
  imageGeneration,
  webSearchPreview,
};
