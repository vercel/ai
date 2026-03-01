import { openai } from '@ai-sdk/openai';
import { generateText, stepCountIs } from 'ai';
import { run } from '../../lib/run';

/**
 * Note:
 * External network access must be enabled for Code Interpreter.
 * To allow outbound HTTP requests from the container:
 * 1. Go to:
 *    https://platform.openai.com/settings/organization/data-controls/hosted-tools
 * 2. Under "Container network mode", select "Allowlist".
 * 3. Add the required domain (e.g., "api.github.com").
 * 4. Click "Save".
 * Without this configuration, outbound requests from the container
 * will fail even if `networkPolicy` is specified in the API request.
 * ⚠️ Security note:
 * Enabling outbound networking allows executed code to communicate
 * with external services. Ensure that only trusted domains are
 * allowlisted and that this configuration complies with your
 * organization's security policies and OpenAI platform policies.
 */

/**
 * Note:
 * When toolChoice is set to "auto", the model may decide not to invoke
 * the Code Interpreter if it believes it can answer the question
 * without executing code.
 *
 * For deterministic behavior in examples or tests, either:
 * 1) Set toolChoice: "required" to force tool execution, or
 * 2) Use a strongly explicit prompt that clearly instructs the model
 *    to execute code via the Code Interpreter.
 */

type OpenAIContainer = {
  id: string;
  status?: string;
  memory_limit?: '1g' | '4g' | '16g' | '64g';
  [key: string]: unknown;
};

async function retrieveContainer(
  containerId: string,
): Promise<OpenAIContainer> {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is not set');
  }

  const response = await fetch(
    `https://api.openai.com/v1/containers/${containerId}`,
    {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    },
  );

  if (!response.ok) {
    throw new Error(
      `Failed to retrieve container: ${response.status} ${response.statusText}`,
    );
  }

  return (await response.json()) as OpenAIContainer;
}

run(async () => {
  const result = await generateText({
    model: openai.responses('gpt-5-mini'),
    tools: {
      code_interpreter: openai.tools.codeInterpreter({
        container: {
          networkPolicy: {
            type: 'allowlist',
            allowedDomains: ['api.github.com'],
          },
        },
      }),
    },
    //　toolChoice:'required',
    prompt: `
      Use the Code Interpreter tool to execute the following Python code exactly as written.
      Do not answer without executing it.
      Do not ask clarifying questions.
      Return only the printed output.

      Python code:
      import requests

      url = "https://api.github.com/repos/vercel/ai"
      r = requests.get(url, timeout=20)
      r.raise_for_status()
      data = r.json()

      print("homepage:", data.get("homepage"))
      print("stars:", data.get("stargazers_count"))
      print("forks:", data.get("forks_count"))
      `,
    stopWhen: stepCountIs(5),
  });

  type CallCodeInterpreterToolCall = {
    type: 'tool-call';
    toolCallId: string;
    toolName: 'code_interpreter';
    input: {
      code: string;
      containerId: string;
    };
  };
  const codeInterpreter = result.content.find(
    content =>
      content.type === 'tool-call' && content.toolName === 'code_interpreter',
  ) as CallCodeInterpreterToolCall | undefined;

  if (!codeInterpreter) {
    console.dir(result, { depth: Infinity });
    console.log('container failed');
    return;
  }
  const {
    input: { containerId },
  } = codeInterpreter;
  console.log(`containerId: ${containerId}`);

  const container = await retrieveContainer(containerId);
  console.log('container memory_limit:', container.memory_limit);
  console.log('container detail:', container);
  console.dir(result, { depth: Infinity });
});
