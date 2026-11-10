import { openai } from '@ai-sdk/openai';
import { streamText } from 'ai';
import { run } from '../../lib/run';
import {
  retrieveOpenAIContainer,
  deleteOpenAIContainer,
} from '../../lib/retrieve-openai-container';

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
 *
 * ⚠️ Security note:
 * Enabling outbound networking allows executed code to communicate
 * with external services. Ensure that only trusted domains are
 * allowlisted and that this configuration complies with your
 * organization's security policies and OpenAI platform policies.
 */

run(async () => {
  const result = streamText({
    model: openai.responses('gpt-5.4-nano'),
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
    toolChoice: 'required',
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
  });

  const codeInterpreter = (await result.staticToolCalls).find(
    call => call.toolName === 'code_interpreter',
  );

  if (!codeInterpreter) {
    console.log('Answer:', await result.text);
    console.log('container failed');
    return;
  }
  const {
    input: { containerId },
  } = codeInterpreter;
  try {
    const container = await retrieveOpenAIContainer(containerId);

    console.log(`containerId: ${containerId}`);
    console.log();
    console.log('container network policy:', {
      type: container.network_policy?.type,
      allowedDomains:
        container.network_policy?.type === 'allowlist'
          ? container.network_policy.allowed_domains
          : undefined,
    });
    console.log();
    console.log('Answer: ', await result.text);
  } finally {
    await deleteOpenAIContainer(containerId);
  }
});
