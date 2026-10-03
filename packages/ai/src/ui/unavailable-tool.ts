import type { DynamicToolUIPart, ToolUIPart } from './ui-messages';

const unavailableToolSymbol = Symbol.for('vercel.ai.ui.unavailableTool');

export function markToolPartAsUnavailable(
  part: DynamicToolUIPart,
): DynamicToolUIPart {
  // Preserve the static tool's provenance for model-message conversion
  // without changing the serialized UI message shape.
  Object.defineProperty(part, unavailableToolSymbol, {
    value: true,
  });

  return part;
}

export function isToolPartFromUnavailableTool(
  part: ToolUIPart | DynamicToolUIPart,
): boolean {
  return (
    (part as unknown as Record<symbol, unknown>)[unavailableToolSymbol] === true
  );
}
