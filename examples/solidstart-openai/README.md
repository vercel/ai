# Vercel AI SDK, Solid.js, SolidStart and OpenAI Chat Example

This example shows how to use the [Vercel AI SDK](https://sdk.vercel.ai/docs) with [Solid](https://solidjs.com/), [SolidStart](https://start.solidjs.com), and [OpenAI](https://openai.com) to create a ChatGPT-like AI-powered streaming chat bot.

## Deploy your own

Deploy the example using [Vercel](https://vercel.com?utm_source=github&utm_medium=readme&utm_campaign=ai-sdk-example):

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fvercel%2Fai%2Ftree%2Fmain%2Fexamples%2Fsolidstart-openai&env=OPENAI_API_KEY&envDescription=OpenAI%20API%20Key&envLink=https%3A%2F%2Fplatform.openai.com%2Faccount%2Fapi-keys&project-name=ai-chat&repository-name=solid-ai-chat)

## How to use

## Creating a project

```bash
# create a new project in the current directory
npm init solid@latest

# create a new project in my-app
npm init solid@latest my-app
```

## Developing

Once you've created a project and installed dependencies with `npm install` (or `pnpm install` or `yarn`), start a development server:

```bash
npm run dev

# or start the server and open the app in a new browser tab
npm run dev -- --open
```

## Building

Solid apps are built with _adapters_, which optimise your project for deployment to different environments.

By default, `npm run build` will generate a Node app that you can run with `npm start`. To use a different adapter, add it to the `devDependencies` in `package.json` and specify in your `vite.config.js`.

## Learn More

To learn more about OpenAI, Nuxt, and the Vercel AI SDK take a look at the following resources:

- [Vercel AI SDK docs](https://sdk.vercel.ai/docs) - learn mode about the Vercel AI SDK
- [Vercel AI Playground](https://play.vercel.ai) - compare and tune 20+ AI models side-by-side
- [OpenAI Documentation](https://platform.openai.com/docs) - learn about OpenAI features and API.
- [SolidStart Documentation](https://start.solidjs.com) - learn about SolidStart.
