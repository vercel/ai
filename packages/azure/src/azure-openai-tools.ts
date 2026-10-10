import {
  codeInterpreter,
  fileSearch,
  imageGeneration,
  webSearch,
  webSearchPreview,
  mcp,
} from '@ai-sdk/openai/internal';

export const azureOpenaiTools: {
  codeInterpreter: typeof codeInterpreter;
  fileSearch: typeof fileSearch;
  imageGeneration: typeof imageGeneration;
  webSearch: typeof webSearch;
  webSearchPreview: typeof webSearchPreview;
  mcp: typeof mcp;
} = {
  codeInterpreter,
  fileSearch,
  imageGeneration,
  webSearch,
  webSearchPreview,
  mcp,
};
