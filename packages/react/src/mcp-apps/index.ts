import { MCPAppRenderer } from './app-renderer';

export { MCPAppRenderer } from './app-renderer';

/**
 * @deprecated Use `MCPAppRenderer` instead.
 */
export const experimental_MCPAppRenderer = MCPAppRenderer;

export type { MCPAppPermission } from './sandbox';
export type {
  MCPAppBridgeHandlers,
  MCPAppMetadata,
  MCPAppRendererProps,
  MCPAppResource,
  MCPAppSandboxConfig,
} from './types';
