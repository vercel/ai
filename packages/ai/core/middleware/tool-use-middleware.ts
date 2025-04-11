import {
  generateId,
  LanguageModelV1Middleware,
  LanguageModelV1Prompt,
  LanguageModelV1StreamPart,
} from 'ai';
import * as RJSON from 'relaxed-json';
import { getPotentialStartIndex } from '../util/get-potential-start-index';

const defaultTemplate = (tools: string) =>
  `You are a function calling AI model. You are provided with function signatures within <tools></tools> XML tags.
You may call one or more functions to assist with the user query. Don't make assumptions about what values to plug into functions.
Here are the available tools: <tools>${tools}</tools>
Use the following pydantic model json schema for each tool call you will make: {'title': 'FunctionCall', 'type': 'object', 'properties': {'arguments': {'title': 'Arguments', 'type': 'object'}, 'name': {'title': 'Name', 'type': 'string'}}, 'required': ['arguments', 'name']}
For each function call return a json object with function name and arguments within <tool_call></tool_call> XML tags as follows:
<tool_call>
{'arguments': <args-dict>, 'name': <function-name>}
</tool_call>`;

export function hermesToolMiddleware({
  toolCallTag = '<tool_call>',
  toolCallEndTag = '</tool_call>',
  toolResponseTag = '<tool_response>',
  toolResponseEndTag = '</tool_response>',
  toolSystemPromptTemplate = defaultTemplate,
}: {
  toolCallTag?: string;
  toolCallEndTag?: string;
  toolResponseTag?: string;
  toolResponseEndTag?: string;
  toolSystemPromptTemplate?: (tools: string) => string;
}): LanguageModelV1Middleware {
  return {
    middlewareVersion: 'v1',
    wrapStream: async ({ doStream }) => {
      const { stream, ...rest } = await doStream();

      let isFirstToolCall = true;
      let isFirstText = true;
      let afterSwitch = false;
      let isToolCall = false;
      let buffer = '';

      let toolCallIndex = -1;
      let toolCallBuffer: string[] = [];

      const transformStream = new TransformStream<
        LanguageModelV1StreamPart,
        LanguageModelV1StreamPart
      >({
        transform(chunk, controller) {
          if (chunk.type === 'finish') {
            if (toolCallBuffer.length > 0) {
              toolCallBuffer.forEach(toolCall => {
                try {
                  const parsedToolCall = RJSON.parse(toolCall) as {
                    name: string;
                    arguments: string;
                  };

                  controller.enqueue({
                    type: 'tool-call',
                    toolCallType: 'function',
                    toolCallId: generateId(),
                    toolName: parsedToolCall.name,
                    args: JSON.stringify(parsedToolCall.arguments),
                  });
                } catch (e) {
                  console.error(`Error parsing tool call: ${toolCall}`, e);

                  controller.enqueue({
                    type: 'text-delta',
                    textDelta: `Failed to parse tool call: ${e.message}`,
                  });
                }
              });
            }

            // stop token
            controller.enqueue(chunk);

            return;
          } else if (chunk.type !== 'text-delta') {
            controller.enqueue(chunk);
            return;
          }

          buffer += chunk.textDelta;

          function publish(text: string) {
            if (text.length > 0) {
              const prefix =
                afterSwitch && (isToolCall ? !isFirstToolCall : !isFirstText)
                  ? '\n' // separator
                  : '';

              if (isToolCall) {
                if (!toolCallBuffer[toolCallIndex]) {
                  toolCallBuffer[toolCallIndex] = '';
                }

                toolCallBuffer[toolCallIndex] += text;
              } else {
                controller.enqueue({
                  type: 'text-delta',
                  textDelta: prefix + text,
                });
              }

              afterSwitch = false;

              if (isToolCall) {
                isFirstToolCall = false;
              } else {
                isFirstText = false;
              }
            }
          }

          do {
            const nextTag = isToolCall ? toolCallEndTag : toolCallTag;
            const startIndex = getPotentialStartIndex(buffer, nextTag);

            // no opening or closing tag found, publish the buffer
            if (startIndex == null) {
              publish(buffer);
              buffer = '';
              break;
            }

            // publish text before the tag
            publish(buffer.slice(0, startIndex));

            const foundFullMatch = startIndex + nextTag.length <= buffer.length;

            if (foundFullMatch) {
              buffer = buffer.slice(startIndex + nextTag.length);
              toolCallIndex++;
              isToolCall = !isToolCall;
              afterSwitch = true;
            } else {
              buffer = buffer.slice(startIndex);
              break;
            }
          } while (true);
        },
      });

      return {
        stream: stream.pipeThrough(transformStream),
        ...rest,
      };
    },
    wrapGenerate: async ({ doGenerate }) => {
      const result = await doGenerate();

      if (!result.text?.includes(toolCallTag)) {
        return result;
      }

      const toolCallRegex = new RegExp(
        `${toolCallTag}(.*?)(?:${toolCallEndTag}|$)`,
        'gs',
      );
      const matches = [...result.text.matchAll(toolCallRegex)];
      const function_call_tuples = matches.map(match => match[1] || match[2]);

      return {
        ...result,
        // TODO: Return the remaining value after extracting the tool call tag.
        text: '',
        toolCalls: function_call_tuples.map(toolCall => {
          const parsedToolCall = RJSON.parse(toolCall) as {
            name: string;
            arguments: string;
          };

          const toolName = parsedToolCall.name;
          const args = parsedToolCall.arguments;

          return {
            toolCallType: 'function',
            toolCallId: generateId(),
            toolName: toolName,
            args: RJSON.stringify(args),
          };
        }),
      };
    },

    transformParams: async ({ params }) => {
      const processedPrompt = params.prompt.map(message => {
        if (message.role === 'assistant') {
          return {
            role: 'assistant',
            content: message.content.map(content => {
              if (content.type === 'tool-call') {
                return {
                  type: 'text',
                  text: `${toolCallTag}${JSON.stringify({
                    arguments: content.args,
                    name: content.toolName,
                  })}${toolCallEndTag}`,
                };
              }

              return content;
            }),
          };
        } else if (message.role === 'tool') {
          return {
            role: 'user',
            content: [
              {
                type: 'text',
                text: message.content
                  .map(
                    content =>
                      `${toolResponseTag}${JSON.stringify({
                        toolName: content.toolName,
                        result: content.result,
                      })}${toolResponseEndTag}`,
                  )
                  .join('\n'),
              },
            ],
          };
        }

        return message;
      }) as LanguageModelV1Prompt;

      // Appropriate fixes are needed as they are disappearing in LanguageModelV2
      const originalToolDefinitions =
        params.mode.type === 'regular' && params.mode.tools
          ? params.mode.tools
          : {};

      const HermesPrompt = toolSystemPromptTemplate(
        JSON.stringify(Object.entries(originalToolDefinitions)),
      );

      const toolSystemPrompt: LanguageModelV1Prompt =
        processedPrompt[0].role === 'system'
          ? [
              {
                role: 'system',
                content: HermesPrompt + '\n\n' + processedPrompt[0].content,
              },
              ...processedPrompt.slice(1),
            ]
          : [
              {
                role: 'system',
                content: HermesPrompt,
              },
              ...processedPrompt,
            ];

      return {
        ...params,
        mode: {
          // set the mode back to regular and remove the default tools.
          type: 'regular',
        },
        prompt: toolSystemPrompt,
      };
    },
  };
}
