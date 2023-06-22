# Vercel AI SDK, Nuxt and LangChain, and OpenAI Chat Example

This example shows how to use the [Vercel AI SDK](https://sdk.vercel.ai/docs) with [Nuxt](https://nuxt.com/), and [LangChain](https://js.langchain.com) to create a ChatGPT-like AI-powered streaming chat bot.

## Deploy your own

Deploy the example using [Vercel](https://vercel.com?utm_source=github&utm_medium=readme&utm_campaign=ai-sdk-example):

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fvercel-labs%2Fai%2Ftree%2Fmain%2Fexamples%2Fnuxt-openai&env=NUXT_OPENAI_API_KEY&envDescription=OpenAI%20API%20Key&envLink=https%3A%2F%2Fplatform.openai.com%2Faccount%2Fapi-keys&project-name=ai-chat&repository-name=nuxt-ai-chat)

## How to use

Execute `nuxi` to bootstrap the example:

```bash
npx nuxi@latest init -t github:vercel-labs/ai/examples/nuxt-langchain nuxt-langchain
```

To run the example locally you need to:

1. Sign up at [OpenAI's Developer Platform](https://platform.openai.com/signup).
2. Go to [OpenAI's dashboard](https://platform.openai.com/account/api-keys) and create an API KEY.
3. Set the required OpenAI environment variable as the token value as shown [the example env file](./.env.example) but in a new file called `.env`.
4. `pnpm install` to install the required dependencies.
5. `pnpm dev` to launch the development server.

## Learn More

To learn more about OpenAI, Nuxt, Langchain and the Vercel AI SDK take a look at the following resources:

- [Vercel AI SDK docs](https://sdk.vercel.ai/docs) - learn mode about the Vercel AI SDK
- [Vercel AI Playground](https://play.vercel.ai) - compare and tune 20+ AI models side-by-side
- [LangChain Documentation](https://js.langchain.com/docs) - learn about LangChain
- [OpenAI Documentation](https://platform.openai.com/docs) - learn about OpenAI features and API.
- [Nuxt Documentation](https://nuxt.com) - learn about Nuxt features and API.
