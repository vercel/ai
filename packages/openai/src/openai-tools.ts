import { codeInterpreter } from './tool/code-interpreter';
import { fileSearch } from './tool/file-search';
import { mcp } from './tool/mcp';
import { webSearchPreview } from './tool/web-search-preview';

export const openaiTools = {
  codeInterpreter,
  fileSearch,
  webSearchPreview,
  mcp,
};
