import type { CoreTool } from '../tool';
import { generateZodTypeString } from './type-zod';

type AnyFunction = (...args: any[]) => any;

function checkAsync(fn: AnyFunction): boolean {
  return fn.constructor.name === 'AsyncFunction';
}

type TOOLS = Record<string, CoreTool>;

const functionDefinition = (tool: TOOLS[string], isAsync: boolean) => {
  const type = generateZodTypeString(tool.returns, 'returns');

  const returnType = isAsync ? `Promise<${type}>` : type;
  const paramType = generateZodTypeString(tool.parameters, 'data');

  return `${
    isAsync ? 'async' : ''
  } (data:${paramType}): ${returnType} => {\n\t// ${
    tool?.description ?? 'Does something'
  }\n\treturn // something\n}`;
};

const displayToolsToCode = (tools: TOOLS) =>
  Object.entries(tools)
    .map(([toolName, toolObject]) => {
      if (!toolObject.execute)
        throw new Error(
          `Execute function of tool "${toolName}" is not specified`,
        );

      if (!toolObject.returns)
        throw new Error(
          `Return Zod schema of tool "${toolName}" is not specified`,
        );

      const isAsync = checkAsync(toolObject.execute);

      return `const ${toolName} = ${functionDefinition(toolObject, isAsync)}`;
    })
    .join('\n\n');

export const newSystemPrompt = (
  text: string,
  tools: TOOLS,
  thisKeyWord: string,
) => `Your Persona: ${text}

Instructions:
- write pure javascript code
- only use functions from the ${thisKeyWord} object
- functions are already defined
- don't imported any external libraries
- nested functions are allowed
- don't use console.log
- don't wrap code in a function
- use let to declare variables
- always end the code with return statement
- wrap the entire Javascript code in \`\`\`js ... \`\`\` code block
- also write the JSON schema for the return value of the code in \`\`\`json ... \`\`\` code block

eg: if function name is build(), then use it as ${thisKeyWord}.build()


Tools:
${displayToolsToCode(tools)}

const ${thisKeyWord} = {
    ${Object.keys(tools).join(', ')}
}

Using above functions, write code to solve the user prompt
`;
