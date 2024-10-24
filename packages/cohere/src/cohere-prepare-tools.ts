import {
  LanguageModelV1,
  LanguageModelV1CallWarning,
  UnsupportedFunctionalityError,
} from '@ai-sdk/provider';

// For reference: https://docs.cohere.com/docs/parameter-types-in-tool-use
export function prepareTools(
  mode: Parameters<LanguageModelV1['doGenerate']>[0]['mode'] & {
    type: 'regular';
  },
): {
  tools:
    | undefined
    | Array<{
        name: string;
        description: string | undefined;
        parameterDefinitions: Record<
          string,
          {
            required: boolean;
            type: 'str' | 'float' | 'int' | 'bool';
            description: string;
          }
        >;
      }>;
  force_single_step: boolean | undefined;
  toolWarnings: LanguageModelV1CallWarning[];
} {
  const tools = mode.tools?.length ? mode.tools : undefined;
  const toolWarnings: LanguageModelV1CallWarning[] = [];

  if (tools == null) {
    return { tools: undefined, force_single_step: undefined, toolWarnings };
  }

  const cohereTools: Array<{
    name: string;
    description: string | undefined;
    parameterDefinitions: Record<
      string,
      {
        required: boolean;
        type: 'str' | 'float' | 'int' | 'bool';
        description: string;
      }
    >;
  }> = [];

  for (const tool of tools) {
    if (tool.type === 'provider-defined') {
      toolWarnings.push({ type: 'unsupported-tool', tool });
    } else {
      const { properties, required } = tool.parameters;
      const parameterDefinitions: Record<string, any> = {};

      if (properties) {
        for (const [key, value] of Object.entries(properties)) {
          if (typeof value === 'object' && value !== null) {
            const { type: JSONType, description } = value;

            let type: 'str' | 'float' | 'int' | 'bool';

            if (typeof JSONType === 'string') {
              switch (JSONType) {
                case 'string':
                  type = 'str';
                  break;
                case 'number':
                  type = 'float';
                  break;
                case 'integer':
                  type = 'int';
                  break;
                case 'boolean':
                  type = 'bool';
                  break;
                default:
                  throw new UnsupportedFunctionalityError({
                    functionality: `Unsupported tool parameter type: ${JSONType}`,
                  });
              }
            } else {
              throw new UnsupportedFunctionalityError({
                functionality: `Unsupported tool parameter type: ${JSONType}`,
              });
            }

            parameterDefinitions[key] = {
              required: required ? required.includes(key) : false,
              type,
              description,
            };
          }
        }
      }

      cohereTools.push({
        name: tool.name,
        description: tool.description,
        parameterDefinitions,
      });
    }
  }

  const toolChoice = mode.toolChoice;

  if (toolChoice == null) {
    return { tools: cohereTools, force_single_step: false, toolWarnings };
  }

  const type = toolChoice.type;

  switch (type) {
    case 'auto':
      return { tools: cohereTools, force_single_step: false, toolWarnings };
    case 'required':
      return { tools: cohereTools, force_single_step: true, toolWarnings };

    // cohere does not support 'none' tool choice, so we remove the tools:
    case 'none':
      return { tools: undefined, force_single_step: false, toolWarnings };

    // cohere does not support tool mode directly,
    // so we filter the tools and force the tool choice through 'any'
    case 'tool':
      return {
        tools: cohereTools.filter(tool => tool.name === toolChoice.toolName),
        force_single_step: true,
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
