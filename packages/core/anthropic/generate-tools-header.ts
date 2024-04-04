import {
  LanguageModelV1FunctionTool,
  UnsupportedJSONSchemaError,
} from '../spec';

// see https://docs.anthropic.com/claude/docs/functions-external-tools#function-calling-format
export const TOOLS_HEADER_START = `\
In this environment you have access to a set of tools you can use to answer the user's question.

You may call them like this:
<function_calls>
<invoke>
<tool_name>$TOOL_NAME</tool_name>
<parameters>
<$PARAMETER_NAME>$PARAMETER_VALUE</$PARAMETER_NAME>
...
</parameters>
</invoke>
</function_calls>

Here are the tools available:
`;

export function generateToolsHeader({
  tools,
  provider,
}: {
  tools: LanguageModelV1FunctionTool[];
  provider: string;
}): string {
  return (
    TOOLS_HEADER_START +
    tools.map(tool => generateToolXml({ tool, provider })).join('\n\n')
  );
}

function generateToolXml({
  tool,
  provider,
}: {
  tool: LanguageModelV1FunctionTool;
  provider: string;
}): string {
  const schema = tool.parameters;

  if (schema.type !== 'object') {
    throw new UnsupportedJSONSchemaError({
      provider,
      schema,
      reason: 'Tool parameters must be objects.',
    });
  }

  if (schema.properties == null) {
    throw new UnsupportedJSONSchemaError({
      provider,
      schema,
      reason: 'Tool parameter objects must have properties.',
    });
  }

  let text = '<tool_description>\n';
  text += `<tool_name>${tool.name}</tool_name>\n`;

  if (tool.description != null) {
    text += `<description>${tool.description}</description>\n`;
  }

  text += '<parameters>\n';

  const properties = Object.entries(schema.properties);
  for (const [name, property] of properties) {
    text += `<parameter>\n`;
    text += `<name>${name}</name>\n`;

    if (typeof property === 'boolean') {
      throw new UnsupportedJSONSchemaError({
        provider,
        schema,
        reason: 'Tool parameter properties must be objects.',
      });
    }

    text += `<type>${property.type}</type>\n`;
    text += `</parameter>\n`;
  }

  text += '</parameters>\n';
  text += '</tool_description>';

  return text;
}
