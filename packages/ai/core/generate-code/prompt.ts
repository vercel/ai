import type { CoreTool } from "../tool";
import { generateZodTypeString } from "./type-zod";

type AnyFunction = (...args: any[]) => any;

function isAsync(fn: AnyFunction): boolean {
  return fn.constructor.name === 'AsyncFunction';
}

type TOOLS = Record<string, CoreTool>

const displayToolsToType = (tools: TOOLS) =>
  Object.entries(tools)
    .map(([key, value]) => {
      const async = isAsync(value.execute)
      return `type ${key} = (data:${generateZodTypeString(value.parameters, "data")}) => ${async ? "Promise<" : ""}${generateZodTypeString(value.returns, "returns")}${async ? ">" : ""}`
    }
    ).join("\n")

const displayToolsToCode = (tools: TOOLS) =>
  Object.entries(tools)
    .map(([key, value]) => `const ${key} = ${isAsync(value.execute) ? "async" : ""}(data:${generateZodTypeString(value.parameters, "data")}):${generateZodTypeString(value.returns, "returns")} => {\n    // ${value?.description ?? "Does something"}\n    return // something\n}`)
    .join("\n\n")

export const newSystemPrompt = (text: string, tools: TOOLS, thisKeyWord: string) => `Your Persona: ${text}

Instructions:
- write pure javascript code
- only use functions from the "Tools" list
- functions are already defined
- don't imported or redifined
- nested functions are allowed
- don't use any external libraries
- don't use console.log
- don't wrap code in a function
- use let to declare variables
- always end the code with return statement
- wrap the entire Javascript code in \`\`\`js ... \`\`\` code block
- also write the JSON schema for the return value of the code in \`\`\`json ... \`\`\` code block

if function name is build(), then use it as ${thisKeyWord}.build()


Tools:
${displayToolsToCode(tools)}

const ${thisKeyWord} = {
    ${Object.keys(tools).join(", ")}
}

Using above functions, write code to solve the user prompt
`