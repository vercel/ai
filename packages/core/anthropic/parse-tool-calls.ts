import { XMLParser } from 'fast-xml-parser';
import {
  LanguageModelV1FunctionTool,
  LanguageModelV1FunctionToolCall,
  ToolCallParseError,
} from '../spec';

export function parseToolCalls({
  text,
  tools,
  generateId,
}: {
  text: string;
  tools: LanguageModelV1FunctionTool[];
  generateId: () => string;
}): {
  modifiedText: string;
  toolCalls: LanguageModelV1FunctionToolCall[];
} {
  try {
    const parser = new XMLParser();

    const startIndex = text.indexOf('<function_calls>');
    const xmlContent = `${text.substring(startIndex)}</function_calls>`;

    const rawFunctionCalls = parser.parse(xmlContent).function_calls;

    const toolCalls: LanguageModelV1FunctionToolCall[] = [];

    if (typeof rawFunctionCalls === 'object') {
      toolCalls.push({
        toolCallType: 'function',
        toolCallId: generateId(),
        toolName: rawFunctionCalls.invoke.tool_name,
        args: JSON.stringify(rawFunctionCalls.invoke.parameters),
      });
    }
    return {
      modifiedText: text.substring(0, startIndex),
      toolCalls,
    };
  } catch (error) {
    throw new ToolCallParseError({
      cause: error,
      text,
      tools,
    });
  }
}
