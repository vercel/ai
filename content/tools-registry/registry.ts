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
    slug: 'tavily',
    name: 'Tavily',
    description:
      'Tavily . Search, Extract, Crawl, and Map',
    packageName: '@tavily/ai-sdk',
    tags: ['search', 'web', 'extraction'],
    apiKeyEnvName: 'TAVILY_API_KEY',
    installCommand: {
      pnpm: 'pnpm install @tavily/ai-sdk',
      npm: 'npm install @tavily/ai-sdk',
      yarn: 'yarn add @tavily/ai-sdk',
      bun: 'bun add @tavily/ai-sdk',
    },
    codeExample: `import { generateText, gateway, stepCountIs } from 'ai';
import { tavilySearch } from '@tavily/ai-sdk';

const { text } = await generateText({
  model: gateway('google/gemini-3-pro-preview'),
  prompt: 'What are the latest developments in agentic search?',
  tools: {
    webSearch: tavilySearch(),
  },
  stopWhen: stepCountIs(3),
});

console.log(text);`,
    docsUrl: 'https://docs.tavily.com/documentation/integrations/vercel',
    apiKeyUrl: 'app.tavily.com/home',
    websiteUrl: 'https://tavily.com',
    npmUrl: 'https://www.npmjs.com/package/@tavily/ai-sdk',
  },
];
