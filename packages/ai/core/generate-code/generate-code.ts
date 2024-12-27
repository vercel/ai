import { generateText } from '../generate-text/index';
import { newSystemPrompt } from './prompt';
import { createFunction } from './function';
import type { CoreTool } from '../tool';

const js_regex = /```js\n([\s\S]*?)\n```/g;
const json_regex = /```json\n([\s\S]*?)\n```/g;

const thisKeyWord = 'listOfFunctions';

type GenerateCodeParams = Omit<Parameters<typeof generateText>[0], 'tools'> & {
  tools: Record<string, CoreTool>;
};
type GenerateCodeReturns = Omit<
  Awaited<ReturnType<typeof generateText>>,
  'toolCalls' | 'toolResults' | 'steps'
> & { code: string; execute: () => Promise<unknown>; schema?: object };

/**
Generate code that can be executed, un-typed result but with JSON schema for a given prompt and tools using a language model.

This function does not stream the output.

@returns
A result object that contains the generated code, JSON schema, executable function, the finish reason, the token usage, and additional information.
 */
const generateCode = async ({
  tools,
  system,
  ...rest
}: GenerateCodeParams): Promise<GenerateCodeReturns> => {
  const systemNew = newSystemPrompt(
    system ?? 'Follow the instructions and write code for the prompt',
    tools,
    thisKeyWord,
  );

  const result = await generateText({
    ...rest,
    toolChoice: 'none',
    system: systemNew,
  });

  const codeBlock = result.text.match(js_regex);
  const jsonCodeBlock = result.text.match(json_regex);

  if (!codeBlock) {
    throw new Error('No code block found');
  }

  const code = codeBlock[0]
    .replace(/```js\n|```/g, '')
    .replaceAll(thisKeyWord, 'this');

  const evalCode = createFunction(tools, code);

  if (jsonCodeBlock) {
    try {
      const schema = JSON.parse(jsonCodeBlock[0].replace(/```json\n|```/g, ''));

      return {
        ...result,
        schema,
        code,
        execute: evalCode,
      };
    } catch (e) {}
  }

  return {
    ...result,
    schema: undefined,
    code,
    execute: evalCode,
  };
};

export { generateCode };
