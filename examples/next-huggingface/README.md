# Vercel AI SDK, Next.js, and Hugging Face Chat Example

This example shows how to use the [Vercel AI SDK](https://sdk.vercel.ai/docs) with [Next.js](https://nextjs.org/) and the [Hugging Face Inference](https://huggingface.co) to create a ChatGPT-like AI-powered streaming chat bot with [Open Assistant's SFT-4 12B](https://huggingface.co/OpenAssistant/oasst-sft-4-pythia-12b-epoch-3.5) as the chat model.

## Deploy your own

Deploy the example using [Vercel](https://vercel.com?utm_source=github&utm_medium=readme&utm_campaign=ai-sdk-example):

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fvercel%2Fai%2Ftree%2Fmain%2Fexamples%2Fnext-huggingface&env=HUGGINGFACE_API_KEY&envDescription=Hugging%20Face%20User%20Access%20Token&envLink=https%3A%2F%2Fhuggingface.co%2Fsettings%2Ftokens&project-name=next-huggingface&repository-name=ai-next-huggingface)

## How to use

Execute [`create-next-app`](https://github.com/vercel/next.js/tree/canary/packages/create-next-app) with [npm](https://docs.npmjs.com/cli/init), [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/), or [pnpm](https://pnpm.io) to bootstrap the example:

```bash
npx create-next-app --example https://github.com/vercel/ai/tree/main/examples/next-huggingface next-huggingface-app
```

```bash
yarn create next-app --example https://github.com/vercel/ai/tree/main/examples/next-huggingface next-huggingface-app
```

```bash
pnpm create next-app --example https://github.com/vercel/ai/tree/main/examples/next-huggingface next-huggingface-app
```

To run the example locally you need to:

1. Sign up at [Hugging Face](https://huggingface.co/join).
2. Go to your [Hugging Face account settings](https://huggingface.co/settings/tokens). Create a User Access Token with `read` access.
3. Set the required Hugging Face environment variable with the token as shown [the example env file](./.env.local.example) but in a new file called `.env.local`.
4. `pnpm install` to install the required dependencies.
5. `pnpm dev` to launch the development server.

## About Hugging Face

[Hugging Face](https://huggingface.co) is company that develops tools for building applications using machine learning. It is most notable for its [Transformers](https://huggingface.co/docs/transformers/index) Python library built for natural language processing applications and its platform that allows users to share machine learning models and datasets.

## About Open Assistant

The model in the example is [Open Assistant SFT-4 12B](https://huggingface.co/OpenAssistant/oasst-sft-4-pythia-12b-epoch-3.5). This is the 4th iteration English supervised-fine-tuning (SFT) model of the Open-Assistant project. It is based on a Pythia 12B that was fine-tuned on human demonstrations of assistant conversations collected through the [Open Assistant](https://open-assistant.io/) human feedback web app before March 25, 2023.

## Learn More

To learn more about Hugging Face, Next.js, and the Vercel AI SDK take a look at the following resources:

- [Vercel AI SDK docs](https://sdk.vercel.ai/docs)
- [Vercel AI Playground](https://play.vercel.ai)
- [Hugging Face Inference Documentation](https://huggingface.co/docs/huggingface.js/inference/README) - learn about Hugging Face Inference SDK features and API.
- [Open-Assistant SFT-4 12B Model](https://huggingface.co/OpenAssistant/oasst-sft-4-pythia-12b-epoch-3.5) - learn about the AI model in use
- [Open Assistant Project](https://open-assistant.io/) - learn about the Open Assistant project
- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
