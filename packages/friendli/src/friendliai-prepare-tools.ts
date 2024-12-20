import {
  LanguageModelV1,
  LanguageModelV1CallWarning,
  UnsupportedFunctionalityError,
} from "@ai-sdk/provider";

import { FriendliAIChatSettings } from "./friendliai-chat-settings";

export function prepareTools({
  mode,
  tools: hostedTools,
}: {
  mode: Parameters<LanguageModelV1["doGenerate"]>[0]["mode"] & {
    type: "regular";
  };

  tools?: FriendliAIChatSettings["tools"];
}): {
  tools:
    | undefined
    | Array<{
        type: string;
        files?: string[];
      }>
    | Array<{
        type: "function";
        function: {
          name: string;
          description: string | undefined;
          parameters: unknown;
        };
      }>;
  tool_choice:
    | { type: "function"; function: { name: string } }
    | "auto"
    | "none"
    | "required"
    | undefined;
  toolWarnings: LanguageModelV1CallWarning[];
} {
  // when the tools array is empty, change it to undefined to prevent errors:
  const tools = mode.tools?.length ? mode.tools : undefined;
  const toolWarnings: LanguageModelV1CallWarning[] = [];

  if (tools == null && hostedTools == null) {
    return { tools: undefined, tool_choice: undefined, toolWarnings };
  }

  const toolChoice = mode.toolChoice;

  const mappedTools: Array<{
    type: "function";
    function: {
      name: string;
      description: string | undefined;
      parameters: unknown;
    };
  }> = [];

  if (tools) {
    for (const tool of tools) {
      if (tool.type === "provider-defined") {
        toolWarnings.push({ type: "unsupported-tool", tool });
      } else {
        mappedTools.push({
          type: "function",
          function: {
            name: tool.name,
            description: tool.description,
            parameters: tool.parameters,
          },
        });
      }
    }
  }

  const mappedHostedTools = hostedTools?.map((tool) => {
    if (tool.type === "file:text") {
      return {
        type: "file:text",
        files: tool.files,
      };
    }

    return {
      type: tool.type,
    };
  });

  if (toolChoice == null) {
    return {
      tools: [...(mappedTools ?? []), ...(mappedHostedTools ?? [])],
      tool_choice: undefined,
      toolWarnings,
    };
  }

  const type = toolChoice.type;

  switch (type) {
    case "auto":
    case "none":
    case "required":
      return {
        tools: [...(mappedTools ?? []), ...(mappedHostedTools ?? [])],
        tool_choice: type,
        toolWarnings,
      };
    case "tool":
      return {
        tools: [...(mappedTools ?? []), ...(mappedHostedTools ?? [])],
        tool_choice: {
          type: "function",
          function: {
            name: toolChoice.toolName,
          },
        },
        toolWarnings,
      };
    default: {
      const _exhaustiveCheck: never = type;
      throw new UnsupportedFunctionalityError({
        functionality: `Unsupported tool choice type: ${_exhaustiveCheck}`,
      });
    }
  }
}
