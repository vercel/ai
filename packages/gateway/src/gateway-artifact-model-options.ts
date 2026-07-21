import type { GatewayProviderOptions } from './gateway-provider-options';

/** Gateway routing options supported by artifact model calls. */
export type GatewayArtifactModelOptions = GatewayProviderOptions;

export type GatewayArtifactModelId =
  | 'fal/tripo3d/h3.1/text-to-3d'
  | 'fal/tripo3d/h3.1/image-to-3d'
  | 'fal/tripo3d/h3.1/multiview-to-3d'
  | 'fal/fal-ai/meshy/v5/remesh'
  | 'fal/fal-ai/hunyuan-3d/v3.1/smart-topology'
  | (string & {});
