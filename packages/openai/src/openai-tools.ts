import { fileSearch } from './tool/file-search';
import { webSearchPreview } from './tool/web-search-preview';

export { fileSearch } from './tool/file-search';
export { webSearchPreview } from './tool/web-search-preview';

export type {
  OpenAITool,
  OpenAITools,
  OpenAIToolChoice,
  OpenAIFunctionTool,
  OpenAIFileSearchTool,
  OpenAIWebSearchPreviewTool,
  OpenAIWebSearchUserLocation,
} from './openai-types';

export const openaiTools = {
  fileSearch,
  webSearchPreview,
};
