# Vercel AI SDK, Next.js, and Anthropic (Claude) Chat Example

This example shows how to use the [Vercel AI SDK](https://sdk.vercel.ai/docs) with [Next.js](https://nextjs.org/) and [Anthropic's Claude Model](https://docs.anthropic.com/claude/reference/getting-started-with-the-api) to create a Claude-like AI-powered streaming chat bot.

## Deploy your own

Deploy the example using [Vercel](https://vercel.com?utm_source=github&utm_medium=readme&utm_campaign=ai-sdk-example):

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fvercel%2Fai%2Ftree%2Fmain%2Fexamples%2Fnext-anthropic&env=ANTHROPIC_API_KEY&envDescription=Anthropic_API_Key&envLink=https://console.anthropic.com/account/keys&project-name=vercel-ai-chat-anthropic&repository-name=vercel-ai-chat-anthropic)

## How to use

Execute [`create-next-app`](https://github.com/vercel/next.js/tree/canary/packages/create-next-app) with [npm](https://docs.npmjs.com/cli/init), [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/), or [pnpm](https://pnpm.io) to bootstrap the example:

```bash
npx create-next-app --example https://github.com/vercel/ai/tree/main/examples/next-anthropic next-anthropic-app
```

```bash
yarn create next-app --example https://github.com/vercel/ai/tree/main/examples/next-anthropic next-anthropic-app
```

```bash
pnpm create next-app --example https://github.com/vercel/ai/tree/main/examples/next-anthropic next-anthropic-app
```

To run the example locally you need to:

1. [Request](https://docs.anthropic.com/claude/docs/getting-access-to-claude) a Claude API Key.
2. Go to [the Anthropic Console](https://console.anthropic.com/) and create an API token.
3. Set the required Anthropic environment variable as the token value as shown [the example env file](./.env.local.example) but in a new file called `.env.local`
4. `pnpm install` to install the required dependencies.
5. `pnpm dev` to launch the development server.

## Learn More

To learn more about OpenAI, Next.js, and the Vercel AI SDK take a look at the following resources:

- [Vercel AI SDK docs](https://sdk.vercel.ai/docs)
- [Vercel AI Playground](https://play.vercel.ai)
- [Claude Documentation](https://docs.anthropic.com/claude/reference/getting-started-with-the-api) - learn about Claude features and API.
- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
