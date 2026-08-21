import {
  codeExecution as spacexaiCodeExecution,
  imageGeneration as spacexaiImageGeneration,
  mcpServer as spacexaiMcpServer,
  spacexaiTools,
  type XaiProvider,
  type XaiProviderSettings,
  viewImage as spacexaiViewImage,
  viewXVideo as spacexaiViewXVideo,
  webSearch as spacexaiWebSearch,
  xSearch as spacexaiXSearch,
} from '@ai-sdk/spacexai';
import { createSpaceXAIProvider } from '@ai-sdk/spacexai/internal';
import { VERSION } from './version';

export * from '@ai-sdk/spacexai';

function withProviderId<
  ARGS extends unknown[],
  RESULT extends { id: `${string}.${string}` },
>(
  toolFactory: (...args: ARGS) => RESULT,
  id: `${string}.${string}`,
): (...args: ARGS) => RESULT {
  return (...args) => ({ ...toolFactory(...args), id });
}

export const codeExecution: typeof spacexaiCodeExecution = withProviderId(
  spacexaiCodeExecution,
  'xai.code_execution',
);
const fileSearch = withProviderId(spacexaiTools.fileSearch, 'xai.file_search');
export const imageGeneration: typeof spacexaiImageGeneration = withProviderId(
  spacexaiImageGeneration,
  'xai.image_generation',
);
export const mcpServer: typeof spacexaiMcpServer = withProviderId(
  spacexaiMcpServer,
  'xai.mcp',
);
export const viewImage: typeof spacexaiViewImage = withProviderId(
  spacexaiViewImage,
  'xai.view_image',
);
export const viewXVideo: typeof spacexaiViewXVideo = withProviderId(
  spacexaiViewXVideo,
  'xai.view_x_video',
);
export const webSearch: typeof spacexaiWebSearch = withProviderId(
  spacexaiWebSearch,
  'xai.web_search',
);
export const xSearch: typeof spacexaiXSearch = withProviderId(
  spacexaiXSearch,
  'xai.x_search',
);

export const xaiTools: typeof spacexaiTools = {
  codeExecution,
  fileSearch,
  imageGeneration,
  mcpServer,
  viewImage,
  viewXVideo,
  webSearch,
  xSearch,
};

export function createXai(options: XaiProviderSettings = {}): XaiProvider {
  return createSpaceXAIProvider({
    options,
    providerName: 'xai',
    tools: xaiTools,
    userAgent: `ai-sdk/xai/${VERSION}`,
  });
}

export const xai = createXai();

export { VERSION };
