import { codeInterpreter } from './tool/code-interpreter';
import { fileSearch } from './tool/file-search';
import { webSearch } from './tool/web-search';
import { webSearchPreview } from './tool/web-search-preview';

export const openaiTools = {
  codeInterpreter,
  fileSearch,
  webSearchPreview,
  webSearch,
};
