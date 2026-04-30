import type { TypedToolError } from './tool-error';
import type { TypedToolResult } from './tool-result';
import type { ToolSet } from './tool-set';

export type ToolOutput<TOOLS extends ToolSet> =
  | TypedToolResult<TOOLS>
  | TypedToolError<TOOLS>;
