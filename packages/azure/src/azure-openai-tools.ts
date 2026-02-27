import {
  codeInterpreter,
  fileSearch,
  imageGeneration,
  webSearchPreview,
  mcp,
} from '@ai-sdk/openai/internal';

export const azureOpenaiTools: {
  codeInterpreter: typeof codeInterpreter;
  fileSearch: typeof fileSearch;
  imageGeneration: typeof imageGeneration;
  webSearchPreview: typeof webSearchPreview;
  mcp: typeof mcp;
} = {
  codeInterpreter,
  fileSearch,
  imageGeneration,
  webSearchPreview,
  mcp,
};
