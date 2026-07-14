import type { LanguageModelV4Content } from '@ai-sdk/provider';
import { safeParseJSON } from '@ai-sdk/provider-utils';

const malformedFunctionStartPattern = /<__function=([^>\s]+)>/g;
const malformedParameterPattern =
  /<__parameter=([^>\s]+)>([\s\S]*?)<\/__parameter>/g;

export async function parseMalformedToolCall({
  generateToolCallId,
  isJsonResponseTool,
  text,
  toolNames,
}: {
  generateToolCallId: () => string;
  isJsonResponseTool: (toolName: string) => boolean;
  text: string;
  toolNames: Set<string>;
}): Promise<
  | {
      content: Array<LanguageModelV4Content>;
      isJsonResponseFromTool: boolean;
    }
  | undefined
> {
  if (toolNames.size === 0 || !text.includes('<tools>')) {
    return undefined;
  }

  const functionStarts = Array.from(
    text.matchAll(malformedFunctionStartPattern),
  );

  if (functionStarts.length === 0) {
    return undefined;
  }

  const content: Array<LanguageModelV4Content> = [];
  let isJsonResponseFromTool = false;

  for (let i = 0; i < functionStarts.length; i++) {
    const startMatch = functionStarts[i];
    const toolName = startMatch[1];

    if (!toolNames.has(toolName)) {
      return undefined;
    }

    const blockStart = startMatch.index + startMatch[0].length;
    const nextBlockStart = functionStarts[i + 1]?.index ?? text.length;
    const closingTagIndex = text.indexOf('</__function>', blockStart);
    const blockEnd =
      closingTagIndex !== -1 && closingTagIndex < nextBlockStart
        ? closingTagIndex
        : nextBlockStart;

    const input = await parseParameters(text.slice(blockStart, blockEnd));
    const inputJson = JSON.stringify(input);

    if (isJsonResponseTool(toolName)) {
      isJsonResponseFromTool = true;
      content.push({ type: 'text', text: inputJson });
    } else {
      content.push({
        type: 'tool-call',
        toolCallId: generateToolCallId(),
        toolName,
        input: inputJson,
      });
    }
  }

  return { content, isJsonResponseFromTool };
}

async function parseParameters(text: string): Promise<Record<string, unknown>> {
  const input: Record<string, unknown> = {};

  for (const parameterMatch of text.matchAll(malformedParameterPattern)) {
    const [, name, rawValue] = parameterMatch;
    const trimmedValue = rawValue.trim();
    const parsedValue = await safeParseJSON({ text: trimmedValue });

    input[name] = parsedValue.success ? parsedValue.value : trimmedValue;
  }

  return input;
}
