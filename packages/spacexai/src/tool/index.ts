import { codeExecution } from './code-execution';
import { fileSearch } from './file-search';
import { imageGeneration } from './image-generation';
import { mcpServer } from './mcp-server';
import { viewImage } from './view-image';
import { viewXVideo } from './view-x-video';
import { webSearch } from './web-search';
import { xSearch } from './x-search';

export {
  codeExecution,
  fileSearch,
  imageGeneration,
  mcpServer,
  viewImage,
  viewXVideo,
  webSearch,
  xSearch,
};

export const spacexaiTools = {
  codeExecution,
  fileSearch,
  imageGeneration,
  mcpServer,
  viewImage,
  viewXVideo,
  webSearch,
  xSearch,
};

/** @deprecated Use `spacexaiTools` instead. */
export const xaiTools = spacexaiTools;
