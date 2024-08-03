# Vercel AI SDK, Zep, Next.js, and OpenAI Chat Example

This example shows how to use the [Vercel AI SDK](https://sdk.vercel.ai/docs) with [Next.js](https://nextjs.org/), [OpenAI](https://openai.com) and [LangChain](https://js.langchain.com) to create a ChatGPT-like AI-powered streaming chat bot with long term memory (provided by [Zep](https://getzep.com)).

## Deploy your own


Deploy the example using [Vercel](https://vercel.com?utm_source=github&utm_medium=readme&utm_campaign=ai-sdk-example):


[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fvercel%2Fai%2Ftree%2Fmain%2Fexamples%2Fnext-zep-langchain&env=OPENAI_API_KEY,ZEP_API_KEY&envDescription=OpenAI%20API%20Key&envLink=https%3A%2F%2Fplatform.openai.com%2Faccount%2Fapi-keys&project-name=vercel-ai-chat-zep-langchain&repository-name=vercel-ai-chat-zep-langchain)

## How to use

Execute [`create-next-app`](https://github.com/vercel/next.js/tree/canary/packages/create-next-app) with [npm](https://docs.npmjs.com/cli/init), [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/), or [pnpm](https://pnpm.io) to bootstrap the example:

```bash
npx create-next-app --example https://github.com/vercel/ai/tree/main/examples/next-zep-langchain next-zep-langchain-app
```

```bash
yarn create next-app --example https://github.com/vercel/ai/tree/main/examples/next-zep-langchain next-zep-langchain-app
```

```bash
pnpm create next-app --example https://github.com/vercel/ai/tree/main/examples/next-zep-langchain next-zep-langchain-app
```

To run the example locally you need to:
1. Sign up at [OpenAI's Developer Platform](https://platform.openai.com/signup).
   1. Go to [OpenAI's dashboard](https://platform.openai.com/account/api-keys) and create an API KEY.
   2. Set the required OpenAI environment variable as the token value as shown [the example env file](./.env.local.example) but in a new file called `.env.local`
2. Sign up for [Zep Account](https://app.getzep.com) and create a new project.
   1. Generate Project API key and set it as `ZEP_API_KEY` in the `.env.local` file.
3. `pnpm install` to install the required dependencies.
4. `pnpm dev` to launch the development server.

## Learn More

To learn more about Zep, OpenAI, Next.js, and the Vercel AI SDK take a look at the following resources:

- [Vercel AI SDK docs](https://sdk.vercel.ai/docs)
- [Vercel AI Playground](https://play.vercel.ai)
- [Zep docs](https://help.getzep.com)
- [OpenAI Documentation](https://platform.openai.com/docs) - learn about OpenAI features and API.
- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
