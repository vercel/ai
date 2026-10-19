import type {
  LanguageModelV4CallOptions,
  SharedV4Warning,
} from '@ai-sdk/provider';
import type {
  DeepSeekResponsesTool,
  DeepSeekResponsesToolChoice,
} from './deepseek-responses-api';

export const WEB_SEARCH_TOOL_ID = 'deepseek.web_search';

export function prepareResponsesTools({
  tools,
  toolChoice,
}: {
  tools: LanguageModelV4CallOptions['tools'];
  toolChoice?: LanguageModelV4CallOptions['toolChoice'];
}): {
  tools: Array<DeepSeekResponsesTool> | undefined;
  toolChoice: DeepSeekResponsesToolChoice | undefined;
  toolWarnings: Array<SharedV4Warning>;
} {
  // when the tools array is empty, change it to undefined to prevent errors:
  tools = tools?.length ? tools : undefined;

  const toolWarnings: Array<SharedV4Warning> = [];

  if (tools == null) {
    return { tools: undefined, toolChoice: undefined, toolWarnings };
  }

  const deepseekTools: Array<DeepSeekResponsesTool> = [];
  let webSearchToolName: string | undefined;

  for (const tool of tools) {
    if (tool.type !== 'provider') {
      deepseekTools.push({
        type: 'function',
        name: tool.name,
        description: tool.description,
        parameters: tool.inputSchema,
        ...(tool.strict != null && { strict: tool.strict }),
      });
      continue;
    }

    if (tool.id === WEB_SEARCH_TOOL_ID) {
      // DeepSeek ignores `search_context_size` and `user_location`, so the
      // tool has no arguments to forward.
      deepseekTools.push({ type: 'web_search' });
      webSearchToolName = tool.name;
      continue;
    }

    toolWarnings.push({
      type: 'unsupported',
      feature: `provider-defined tool ${tool.id}`,
    });
  }

  if (toolChoice == null) {
    return { tools: deepseekTools, toolChoice: undefined, toolWarnings };
  }

  switch (toolChoice.type) {
    case 'auto':
    case 'none':
    case 'required':
      return {
        tools: deepseekTools,
        toolChoice: toolChoice.type,
        toolWarnings,
      };
    case 'tool':
      return {
        tools: deepseekTools,
        toolChoice:
          toolChoice.toolName === webSearchToolName
            ? { type: 'web_search' }
            : { type: 'function', name: toolChoice.toolName },
        toolWarnings,
      };
    default: {
      const _exhaustiveCheck: never = toolChoice;
      toolWarnings.push({
        type: 'unsupported',
        feature: `tool choice type: ${(_exhaustiveCheck as { type: string }).type}`,
      });
      return { tools: deepseekTools, toolChoice: undefined, toolWarnings };
    }
  }
}
