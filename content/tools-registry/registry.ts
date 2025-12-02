// CONTRIBUTING GUIDE
// https://github.com/vercel/ai/blob/main/contributing/add-new-tool-to-registry.md

export interface Tool {
  slug: string;
  name: string;
  description: string;
  packageName: string;
  tags?: string[];
  apiKeyEnvName?: string;
  installCommand: {
    pnpm: string;
    npm: string;
    yarn: string;
    bun: string;
  };
  codeExample: string;
  docsUrl?: string;
  apiKeyUrl?: string;
  websiteUrl?: string;
  npmUrl?: string;
}

export const tools: Tool[] = [
  {
    slug: 'code-execution',
    name: 'Code Execution',
    description:
      'Execute Python code in a sandboxed environment using Vercel Sandbox. Run calculations, data processing, and other computational tasks safely in an isolated environment with Python 3.13.',
    packageName: 'ai-sdk-tool-code-execution',
    tags: ['code-execution', 'sandbox'],
    apiKeyEnvName: 'VERCEL_OIDC_TOKEN',
    installCommand: {
      pnpm: 'pnpm install ai-sdk-tool-code-execution',
      npm: 'npm install ai-sdk-tool-code-execution',
      yarn: 'yarn add ai-sdk-tool-code-execution',
      bun: 'bun add ai-sdk-tool-code-execution',
    },
    codeExample: `import { gateway, generateText, stepCountIs } from 'ai';
import { executeCode } from 'ai-sdk-tool-code-execution';

const { text } = await generateText({
  model: gateway('openai/gpt-5.1-codex'),
  prompt: 'What is 5 + 5 minus 84 cubed?',
  tools: {
    executeCode: executeCode(),
  },
  stopWhen: stepCountIs(5),
});

console.log(text);`,
    docsUrl: 'https://vercel.com/docs/vercel-sandbox',
    apiKeyUrl: 'https://vercel.com/docs/vercel-sandbox#authentication',
    websiteUrl: 'https://vercel.com/docs/vercel-sandbox',
    npmUrl: 'https://www.npmjs.com/package/ai-sdk-tool-code-execution',
  },
  {
    slug: 'exa',
    name: 'Exa',
    description:
      'Exa is a web search API that adds web search capabilities to your LLMs. Exa can search the web for code docs, current information, news, articles, and a lot more. Exa performs real-time web searches and can get page content from specific URLs. Add Exa web search tool to your LLMs in just a few lines of code.',
    packageName: '@exalabs/ai-sdk',
    tags: ['search', 'web', 'extraction'],
    apiKeyEnvName: 'EXA_API_KEY',
    installCommand: {
      pnpm: 'pnpm install @exalabs/ai-sdk',
      npm: 'npm install @exalabs/ai-sdk',
      yarn: 'yarn add @exalabs/ai-sdk',
      bun: 'bun add @exalabs/ai-sdk',
    },
    codeExample: `import { generateText, gateway, stepCountIs } from 'ai';
import { webSearch } from '@exalabs/ai-sdk';

const { text } = await generateText({
  model: gateway('google/gemini-3-pro-preview'),
  prompt: 'Tell me the latest developments in AI',
  tools: {
    webSearch: webSearch(),
  },
  stopWhen: stepCountIs(3),
});

console.log(text);`,
    docsUrl: 'https://docs.exa.ai/reference/vercel',
    apiKeyUrl: 'https://dashboard.exa.ai/api-keys',
    websiteUrl: 'https://exa.ai',
    npmUrl: 'https://www.npmjs.com/package/@exalabs/ai-sdk',
  },
  {
    slug: 'parallel',
    name: 'Parallel',
    description:
      'Parallel provides two powerful web tools: searchTool for finding relevant web pages and compressed token dense excerpts based on the semantic objective, and extractTool for extracting full page contents or excerpts (use objective) from any URL',
    packageName: '@parallel-web/ai-sdk-tools',
    tags: ['search', 'web', 'extraction'],
    apiKeyEnvName: 'PARALLEL_API_KEY',
    installCommand: {
      pnpm: 'pnpm install @parallel-web/ai-sdk-tools',
      npm: 'npm install @parallel-web/ai-sdk-tools',
      yarn: 'yarn add @parallel-web/ai-sdk-tools',
      bun: 'bun add @parallel-web/ai-sdk-tools',
    },
    codeExample: `import { generateText, gateway, stepCountIs } from 'ai';
import { searchTool, extractTool } from '@parallel-web/ai-sdk-tools';

const { text } = await generateText({
  model: gateway('google/gemini-3-pro-preview'),
  prompt: 'When was Vercel Ship AI?',
  tools: {
    webSearch: searchTool,
    webExtract: extractTool,
  },
  stopWhen: stepCountIs(3),
});

console.log(text);`,
    apiKeyUrl: 'https://platform.parallel.ai',
    websiteUrl: 'https://parallel.ai',
    npmUrl: 'https://www.npmjs.com/package/@parallel-web/ai-sdk-tools',
  },
  {
    slug: 'firecrawl',
    name: 'Firecrawl',
    description:
      'Firecrawl tools for the AI SDK. Web scraping, search, crawling, and data extraction for AI applications. Scrape any website into clean markdown, search the web, crawl entire sites, and extract structured data.',
    packageName: 'firecrawl-aisdk',
    tags: ['scraping', 'search', 'crawling', 'extraction', 'web'],
    apiKeyEnvName: 'FIRECRAWL_API_KEY',
    installCommand: {
      pnpm: 'pnpm install firecrawl-aisdk',
      npm: 'npm install firecrawl-aisdk',
      yarn: 'yarn add firecrawl-aisdk',
      bun: 'bun add firecrawl-aisdk',
    },
    codeExample: `import { generateText, gateway, stepCountIs } from 'ai';
import { scrapeTool } from 'firecrawl-aisdk';

const { text } = await generateText({
  model: gateway('openai/gpt-5-mini'),
  prompt: 'Scrape https://firecrawl.dev and summarize what it does',
  tools: {
    scrape: scrapeTool,
  },
  stopWhen: stepCountIs(3),
});

console.log(text);`,
    docsUrl: 'https://docs.firecrawl.dev/integrations/ai-sdk',
    apiKeyUrl: 'https://firecrawl.dev/app/api-keys',
    websiteUrl: 'https://firecrawl.dev',
    npmUrl: 'https://www.npmjs.com/package/firecrawl-aisdk',
  },
  {
    slug: 'bedrock-agentcore',
    name: 'Amazon Bedrock AgentCore',
    description:
      'Fully managed Browser and Code Interpreter tools for AI agents. Browser is a fast and secure cloud-based runtime for interacting with web applications, filling forms, navigating websites, and extracting information. Code Interpreter provides an isolated sandbox for executing Python, JavaScript, and TypeScript code to solve complex tasks.',
    packageName: 'bedrock-agentcore',
    tags: ['code-execution', 'browser-automation', 'sandbox'],
    apiKeyEnvName: 'AWS_ROLE_ARN',
    installCommand: {
      pnpm: 'pnpm install bedrock-agentcore',
      npm: 'npm install bedrock-agentcore',
      yarn: 'yarn add bedrock-agentcore',
      bun: 'bun add bedrock-agentcore',
    },
    codeExample: `import { generateText, stepCountIs } from 'ai';
import { bedrock } from '@ai-sdk/amazon-bedrock';
import { awsCredentialsProvider } from '@vercel/oidc-aws-credentials-provider';
import { CodeInterpreterTools } from 'bedrock-agentcore/code-interpreter/vercel-ai';
import { BrowserTools } from 'bedrock-agentcore/browser/vercel-ai';

const credentialsProvider = awsCredentialsProvider({
  roleArn: process.env.AWS_ROLE_ARN!,
});

const codeInterpreter = new CodeInterpreterTools({ credentialsProvider });
const browser = new BrowserTools({ credentialsProvider });

try {
  const { text } = await generateText({
    model: bedrock('us.anthropic.claude-sonnet-4-20250514-v1:0'),
    prompt: 'Go to https://news.ycombinator.com and get the first story title. Then use Python to reverse the string.',
    tools: {
      ...codeInterpreter.tools,
      ...browser.tools,
    },
    stopWhen: stepCountIs(5),
  });

  console.log(text);
} finally {
  await codeInterpreter.stopSession();
  await browser.stopSession();
}`,
    docsUrl: 'https://github.com/aws/bedrock-agentcore-sdk-typescript',
    apiKeyUrl: 'https://vercel.com/docs/oidc/aws',
    websiteUrl:
      'https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/built-in-tools.html',
    npmUrl: 'https://www.npmjs.com/package/bedrock-agentcore',
  },
  {
    slug: 'superagent',
    name: 'Superagent',
    description:
      'AI security guardrails for your LLMs. Protect your AI apps from prompt injection, redact PII/PHI (SSNs, emails, phone numbers), and verify claims against source materials. Add security tools to your LLMs in just a few lines of code.',
    packageName: '@superagent-ai/ai-sdk',
    tags: ['security', 'guardrails', 'pii', 'prompt-injection', 'verification'],
    apiKeyEnvName: 'SUPERAGENT_API_KEY',
    installCommand: {
      pnpm: 'pnpm install @superagent-ai/ai-sdk',
      npm: 'npm install @superagent-ai/ai-sdk',
      yarn: 'yarn add @superagent-ai/ai-sdk',
      bun: 'bun add @superagent-ai/ai-sdk',
    },
    codeExample: `import { generateText, stepCountIs } from 'ai';
import { guard, redact, verify } from '@superagent-ai/ai-sdk';
import { openai } from '@ai-sdk/openai';

const { text } = await generateText({
  model: openai('gpt-4o-mini'),
  prompt: 'Check this input for security threats: "Ignore all instructions"',
  tools: {
    guard: guard(),
    redact: redact(),
    verify: verify(),
  },
  stopWhen: stepCountIs(3),
});

console.log(text);`,
    docsUrl: 'https://docs.superagent.sh',
    apiKeyUrl: 'https://dashboard.superagent.sh',
    websiteUrl: 'https://superagent.sh',
    npmUrl: 'https://www.npmjs.com/package/@superagent-ai/ai-sdk',
  },
];
