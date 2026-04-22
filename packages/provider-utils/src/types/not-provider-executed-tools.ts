import { ProviderExecutedTool } from './tool';
import { ToolSet } from './tool-set';

/**
 * Filters a tool set down to tools that are not executed by the provider.
 */
export type NotProviderExecutedTools<TOOLS extends ToolSet> = {
  [KEY in keyof TOOLS as TOOLS[KEY] extends ProviderExecutedTool<any, any, any>
    ? never
    : KEY]: TOOLS[KEY];
};
