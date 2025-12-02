import { SharedV3ProviderMetadata, SharedV3Warning } from '@ai-sdk/provider';
import { validateTypes } from '@ai-sdk/provider-utils';
import {
  AnthropicAdvancedToolUse,
  anthropicInputExamplesSchema,
  anthropicProgrammaticToolCallingSchema,
  AnthropicTool,
  anthropicToolSearchSchema,
} from './anthropic-messages-api';

/**
 * Extracts and validates Anthropic advanced tool use configuration from provider metadata.
 *
 * This function processes provider metadata to extract tool use configuration options including
 * deferred loading, allowed callers, and input examples. It supports both camelCase and snake_case
 * property naming conventions for backwards compatibility.
 *
 * @param providerMetadata - Optional shared provider metadata containing Anthropic-specific configuration
 * @returns A promise that resolves to an object containing validated advanced tool use settings:
 *   - `deferLoading`: Validated tool search/defer loading configuration
 *   - `allowedCallers`: Validated programmatic tool calling configuration
 *   - `inputExamples`: Validated input examples configuration
 * @throws Will throw an error if any of the extracted configurations fail validation
 */

export async function getAnthropicAdvancedToolUseFeaturesSupport(
  providerMetadata: SharedV3ProviderMetadata | undefined,
): Promise<AnthropicAdvancedToolUse | undefined> {
  const anthropic = providerMetadata?.anthropic;
  const deferLoading = anthropic?.defer_loading ?? anthropic?.deferLoading;
  const inputExamples = anthropic?.input_examples ?? anthropic?.inputExamples;
  const allowed_callers =
    anthropic?.allowed_callers ?? anthropic?.allowedCallers;

  const [parseDeferLoading, parseAllowedCallers, parseInputExamples] =
    await Promise.all([
      validateTypes({
        value: deferLoading,
        schema: anthropicToolSearchSchema,
      }),
      validateTypes({
        value: allowed_callers,
        schema: anthropicProgrammaticToolCallingSchema,
      }),
      validateTypes({
        value: inputExamples,
        schema: anthropicInputExamplesSchema,
      }),
    ]);

  let result: AnthropicAdvancedToolUse = {};
  if (parseDeferLoading !== undefined) {
    result.defer_loading = parseDeferLoading;
  }

  if (parseAllowedCallers !== undefined) {
    result.allowed_callers = parseAllowedCallers;
  }

  if (parseInputExamples !== undefined) {
    result.input_examples = parseInputExamples;
  }

  return result;
}

export const handleAnthropicAdvancedToolUseFeaturesWarnings = (
  anthropicTools: AnthropicTool[],
  betas: Set<string>,
) => {
  const toolWarnings: SharedV3Warning[] = [];

  // Check if any tool uses defer_loading
  const anyToolUsesDeferLoading = anthropicTools.some(
    t => 'defer_loading' in t && t.defer_loading === true,
  );

  const searchTool = anthropicTools.find(
    t =>
      t.name === 'tool_search_tool_bm25' || t.name === 'tool_search_tool_regex',
  );

  if (anyToolUsesDeferLoading && !searchTool) {
    toolWarnings.push({
      type: 'unsupported',
      feature: `tool`,
      details: `At least one tool has defer_loading set to true, but no tool search tool (tool_search_tool_bm25 or tool_search_tool_regex) is provided. A tool search tool is required when using deferred loading.`,
    });
  }

  const anyToolUsesAdvancedToolUseFeature = anthropicTools.some(
    t =>
      ('defer_loading' in t && t.defer_loading === true) ||
      ('allowed_callers' in t && (t.allowed_callers ?? [])?.length > 0) ||
      ('input_examples' in t && (t.input_examples ?? [])?.length > 0),
  );

  if (
    anyToolUsesAdvancedToolUseFeature &&
    !betas.has('advanced-tool-use-2025-11-20')
  ) {
    toolWarnings.push({
      type: 'unsupported',
      feature: `tool`,
      details: `At least one tool uses advanced tool use features (defer_loading, allowed_callers, or input_examples), but the required beta header 'advanced-tool-use-2025-11-20' is not enabled.`,
    });
  }

  return toolWarnings;
};
