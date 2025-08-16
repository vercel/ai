import { codeInterpreter } from './tool/code-interpreter';
import { fileSearch } from './tool/file-search';
import { generateImage } from './tool/image-generation';
import { webSearchPreview } from './tool/web-search-preview';

export const openaiTools = {
  codeInterpreter,
  fileSearch,
  generateImage,
  webSearchPreview,
};
