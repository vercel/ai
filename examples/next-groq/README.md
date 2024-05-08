2# Vercel AI SDK, Next.js, and Groq Chat Example

This example shows how to use the [Vercel AI SDK](https://sdk.vercel.ai/docs) with [Next.js](https://nextjs.org/) and [Groq](https://groq.com/) to create a ChatGPT-like AI-powered streaming chat bot. Groq's APIs are compatible with OpenAI's so we use the OpenAI JS SDK but change its base URL to point to Groq's API with an environment variable.

## Deploy your own

Deploy the example using [Vercel](https://vercel.com?utm_source=github&utm_medium=readme&utm_campaign=ai-sdk-example):

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fvercel%2Fai%2Ftree%2Fmain%2Fexamples%2Fnext-groq&env=GROQ_API_KEY&envDescription=Groq%20API%20Key&envLink=https%3A%2F%2Fwow.groq.com&project-name=vercel-ai-chat-groq&repository-name=vercel-ai-chat-groq)

## How to use

Execute [`create-next-app`](https://github.com/vercel/next.js/tree/canary/packages/create-next-app) with [npm](https://docs.npmjs.com/cli/init), [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/), or [pnpm](https://pnpm.io) to bootstrap the example:

```bash
npx create-next-app --example https://github.com/vercel/ai/tree/main/examples/next-groq next-groq-app
```

```bash
yarn create next-app --example https://github.com/vercel/ai/tree/main/examples/next-groq next-groq-app
```

```bash
pnpm create next-app --example https://github.com/vercel/ai/tree/main/examples/next-groq next-groq-app
```

To run the example locally you need to:

1. Sign up at [Groq's Developer Platform](https://wow.groq.com) and create an API KEY.
2. Set the required environment variables as shown [the example env file](./.env.local.example) but in a new file called `.env.local`
3. `pnpm install` to install the required dependencies.
4. `pnpm dev` to launch the development server.

## Learn More

To learn more about OpenAI, Next.js, and the Vercel AI SDK take a look at the following resources:

- [Vercel AI SDK docs](https://sdk.vercel.ai/docs)
- [Vercel AI Playground](https://play.vercel.ai)
- [Groq Documentation](https://wow.groq.com/) - learn about Groq features and API.
- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
