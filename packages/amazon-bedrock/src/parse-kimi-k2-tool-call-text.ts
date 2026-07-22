type ParsedToolCall = {
  toolCallId: string;
  toolName: string;
  input: string;
};

export type ParsedKimiK2ToolCallText = {
  reasoningText?: string;
  text: string;
  toolCalls: ParsedToolCall[];
};

const nativeToolCallPattern =
  /<\|tool_call_begin\|>\s*([\w.-]+:\d+)\s*<\|tool_call_argument_begin\|>\s*([\s\S]*?)\s*<\|tool_call_end\|>/g;
const xmlToolCallPattern = /<function=([\w.-]+)>\s*([\s\S]*?)\s*<\/function>/g;
const xmlParameterPattern =
  /<parameter=([\w.-]+)>\s*([\s\S]*?)\s*<\/parameter>/g;

export function parseKimiK2ToolCallText({
  text,
  toolNames,
  generateId,
}: {
  text: string;
  toolNames: Set<string>;
  generateId: () => string;
}): ParsedKimiK2ToolCallText | undefined {
  const matches: Array<{
    index: number;
    length: number;
    toolCall: ParsedToolCall;
  }> = [];

  for (const match of text.matchAll(nativeToolCallPattern)) {
    const toolCallId = match[1];
    const separatorIndex = toolCallId.lastIndexOf(':');
    const qualifiedToolName = toolCallId.slice(0, separatorIndex);
    const toolName = qualifiedToolName.startsWith('functions.')
      ? qualifiedToolName.slice('functions.'.length)
      : qualifiedToolName;

    if (!toolNames.has(toolName)) {
      return undefined;
    }

    matches.push({
      index: match.index,
      length: match[0].length,
      toolCall: {
        toolCallId,
        toolName,
        input: match[2].trim() || '{}',
      },
    });
  }

  for (const match of text.matchAll(xmlToolCallPattern)) {
    const toolName = match[1];
    if (!toolNames.has(toolName)) {
      return undefined;
    }

    const input: Record<string, unknown> = {};
    let parameterCount = 0;
    let unmatchedBody = match[2];

    for (const parameterMatch of match[2].matchAll(xmlParameterPattern)) {
      parameterCount += 1;
      input[parameterMatch[1]] = parseParameterValue(parameterMatch[2].trim());
      unmatchedBody = unmatchedBody.replace(parameterMatch[0], '');
    }

    if (
      unmatchedBody.trim() !== '' ||
      (match[2].trim() !== '' && parameterCount === 0)
    ) {
      return undefined;
    }

    matches.push({
      index: match.index,
      length: match[0].length,
      toolCall: {
        toolCallId: generateId(),
        toolName,
        input: JSON.stringify(input),
      },
    });
  }

  if (matches.length === 0) {
    return undefined;
  }

  matches.sort((left, right) => left.index - right.index);

  let remainingText = text;
  for (const match of [...matches].sort(
    (left, right) => right.index - left.index,
  )) {
    remainingText =
      remainingText.slice(0, match.index) +
      remainingText.slice(match.index + match.length);
  }

  remainingText = remainingText
    .replace(/<\|tool_calls_section_begin\|>/g, '')
    .replace(/<\|tool_calls_section_end\|>/g, '');

  const { reasoningText, visibleText } = extractThinkingText(remainingText);

  return {
    ...(reasoningText.trim() !== '' && { reasoningText: reasoningText.trim() }),
    text: visibleText,
    toolCalls: matches.map(match => match.toolCall),
  };
}

export function isDuplicateKimiK2ToolCallText({
  text,
  toolCalls,
}: {
  text: string;
  toolCalls: ParsedToolCall[];
}) {
  const normalizedText = text
    .replace(/<\|tool_calls_section_(?:begin|end)\|>/g, '')
    .replace(/<\|tool_call_(?:begin|argument_begin|end)\|>/g, '')
    .replace(/functions\.[\w.-]+:\d+/g, '')
    .trim();

  const parsedText = parseJson(normalizedText);
  if (parsedText === undefined) {
    return false;
  }

  return toolCalls.some(toolCall => {
    const parsedInput = parseJson(toolCall.input);
    return (
      parsedInput !== undefined &&
      JSON.stringify(parsedInput) === JSON.stringify(parsedText)
    );
  });
}

function extractThinkingText(text: string): {
  reasoningText: string;
  visibleText: string;
} {
  const thinkStart = text.indexOf('<think>');
  if (thinkStart === -1) {
    return { reasoningText: '', visibleText: text };
  }

  const reasoningStart = thinkStart + '<think>'.length;
  const thinkEnd = text.indexOf('</think>', reasoningStart);

  if (thinkEnd === -1) {
    return {
      reasoningText: text.slice(reasoningStart),
      visibleText: text.slice(0, thinkStart),
    };
  }

  return {
    reasoningText: text.slice(reasoningStart, thinkEnd),
    visibleText:
      text.slice(0, thinkStart) + text.slice(thinkEnd + '</think>'.length),
  };
}

function parseParameterValue(value: string): unknown {
  const parsedValue = parseJson(value);
  return parsedValue === undefined ? value : parsedValue;
}

function parseJson(value: string): unknown | undefined {
  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
}
