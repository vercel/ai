import type { DynamicToolUIPart, ToolUIPart } from './ui-messages';

export function markToolPartAsUnavailable(
  part: DynamicToolUIPart,
): DynamicToolUIPart {
  // Preserve the static tool's provenance across persistence boundaries so
  // model-message conversion never falls back to its unfiltered raw output.
  part.dynamic = false;

  return part;
}

export function isToolPartFromUnavailableTool(
  part: ToolUIPart | DynamicToolUIPart,
): boolean {
  return part.type === 'dynamic-tool' && part.dynamic === false;
}
