import type {
  LanguageModelV2Prompt,
  LanguageModelV2Middleware,
  LanguageModelV2StreamPart,
  LanguageModelV2ToolCall,
} from '@ai-sdk/provider';
import { generateId, parse } from '@ai-sdk/provider-utils';
import { getPotentialStartIndex } from '../util/get-potential-start-index';

export const gemmaToolMiddleware = createToolMiddleware({
  toolSystemPromptTemplate(tools) {
    return `You have access to functions. If you decide to invoke any of the function(s),
you MUST put it in the format of
\`\`\`tool_call
{'name': <function-name>, 'arguments': <args-dict>}
\`\`\`
You SHOULD NOT include any other text in the response if you call a function
${tools}`;
  },
  toolCallTag: '```tool_call\n',
  toolCallEndTag: '```',
  toolResponseTag: '```tool_response\n',
  toolResponseEndTag: '\n```',
});

export const hermesToolMiddleware = createToolMiddleware({
  toolSystemPromptTemplate(tools) {
    return `You are a function calling AI model.
You are provided with function signatures within <tools></tools> XML tags.
You may call one or more functions to assist with the user query.
Don't make assumptions about what values to plug into functions.
Here are the available tools: <tools>${tools}</tools>
Use the following pydantic model json schema for each tool call you will make: {'title': 'FunctionCall', 'type': 'object', 'properties': {'arguments': {'title': 'Arguments', 'type': 'object'}, 'name': {'title': 'Name', 'type': 'string'}}, 'required': ['arguments', 'name']}
For each function call return a json object with function name and arguments within <tool_call></tool_call> XML tags as follows:
<tool_call>
{'arguments': <args-dict>, 'name': <function-name>}
</tool_call>`;
  },
  toolCallTag: '<tool_call>',
  toolCallEndTag: '</tool_call>',
  toolResponseTag: '<tool_response>',
  toolResponseEndTag: '</tool_response>',
});

export function createToolMiddleware({
  toolCallTag,
  toolCallEndTag,
  toolResponseTag,
  toolResponseEndTag,
  toolSystemPromptTemplate,
}: {
  toolCallTag: string;
  toolCallEndTag: string;
  toolResponseTag: string;
  toolResponseEndTag: string;
  toolSystemPromptTemplate: (tools: string) => string;
}): LanguageModelV2Middleware {
  return {
    middlewareVersion: 'v2',
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
        LanguageModelV2StreamPart,
        LanguageModelV2StreamPart
      >({
        transform(chunk, controller) {
          if (chunk.type === 'finish') {
            if (toolCallBuffer.length > 0) {
              toolCallBuffer.forEach(toolCall => {
                try {
                  // TODO, replace like 'relaxed-json'
                  const parsedToolCall = parse(toolCall) as {
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
                    type: 'text',
                    text: `Failed to parse tool call: ${e}`,
                  });
                }
              });
            }

            // stop token
            controller.enqueue(chunk);

            return;
          } else if (chunk.type !== 'text') {
            controller.enqueue(chunk);
            return;
          }

          buffer += chunk.text;

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
                  type: 'text',
                  text: prefix + text,
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

      // NOTE: Needs more proper handling
      if (result.content.length !== 1) {
        return result;
      }

      if (
        result.content[0].type === 'text' &&
        !result.content[0].text.includes(toolCallTag)
      ) {
        return result;
      }

      const toolCallRegex = new RegExp(
        `${toolCallTag}(.*?)(?:${toolCallEndTag}|$)`,
        'gs',
      );

      const matches =
        result.content[0].type === 'text'
          ? Array.from(result.content[0].text.matchAll(toolCallRegex))
          : [];
      const function_call_tuples = matches.map(match => match[1] || match[2]);

      const tool_calls: LanguageModelV2ToolCall[] = function_call_tuples.map(
        toolCall => {
          // TODO, replace like 'relaxed-json'
          const parsedToolCall = parse(toolCall) as {
            name: string;
            arguments: string;
          };

          const toolName = parsedToolCall.name;
          const args = parsedToolCall.arguments;

          return {
            type: 'tool-call',
            toolCallType: 'function',
            toolCallId: generateId(),
            toolName: toolName,
            args: JSON.stringify(args),
          } as LanguageModelV2ToolCall;
        },
      );

      return {
        ...result,
        // TODO: Return the remaining value after extracting the tool call tag.
        content: [...tool_calls],
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
      }) as LanguageModelV2Prompt;

      const HermesPrompt = toolSystemPromptTemplate(
        JSON.stringify(Object.entries(params.tools || {})),
      );

      const toolSystemPrompt: LanguageModelV2Prompt =
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
        prompt: toolSystemPrompt,

        // set the mode back to regular and remove the default tools.
        tools: [],
        toolChoice: undefined,
      };
    },
  };
}
