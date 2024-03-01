<a href="https://sdk.vercel.ai/rsc-demo">
  <img alt="Generative UI Demo" src="https://github.com/vercel/ai/assets/4060187/f21fa839-c710-4f09-9af4-2056f603d98f">
  <h1 align="center">Generative UI Demo</h1>
</a>

<p align="center">
  An experimental preview of AI SDK 3.0 with Generative UI support
</p>

## Features

- [Next.js](https://nextjs.org) App Router + React Server Components
- [Vercel AI SDK 3.0](https://sdk.vercel.ai/docs) for Generative UI
- OpenAI Tools/Function Calling
- [shadcn/ui](https://ui.shadcn.com)

## Quick Links

- [Read the blog post](https://vercel.com/blog/ai-sdk-3-generative-ui)
- [See the demo](https://sdk.vercel.ai/demo)
- [Visit the docs](https://sdk.vercel.ai/docs/concepts/ai-rsc)

## Deploy Your Own

You can deploy your own version of the demo to Vercel with one click:

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fvercel%2Fai%2Fblob%2Fmain%2Fexamples%2Fnext-ai-rsc&env=OPENAI_API_KEY&envDescription=OpenAI%20API%20Key&envLink=https%3A%2F%2Fplatform.openai.com%2Fapi-keys)

## Running locally

You will need to use the environment variables [defined in `.env.example`](.env.example) to run Next.js AI Chatbot. It's recommended you use [Vercel Environment Variables](https://vercel.com/docs/projects/environment-variables) for this, but a `.env` file is all that is necessary.

> Note: You should not commit your `.env` file or it will expose secrets that will allow others to control access to your various OpenAI and authentication provider accounts.

1. Install Vercel CLI: `npm i -g vercel`
2. Link local instance with Vercel and GitHub accounts (creates `.vercel` directory): `vercel link`
3. Download your environment variables: `vercel env pull`

```bash
pnpm install
pnpm dev
```

Your app should now be running on [localhost:3000](http://localhost:3000/).

## Authors

This library is created by [Vercel](https://vercel.com) and [Next.js](https://nextjs.org) team members, with contributions from:

- Shu Ding ([@shuding\_](https://twitter.com/shuding_)) - [Vercel](https://vercel.com)
- Max Leiter ([@max_leiter](https://twitter.com/max_leiter)) - [Vercel](https://vercel.com)
- Jeremy Philemon ([@jeremyphilemon](https://github.com/jeremyphilemon)) - [Vercel](https://vercel.com)
- shadcn ([@shadcn](https://twitter.com/shadcn)) - [Vercel](https://vercel.com)
- Jared Palmer ([@jaredpalmer](https://twitter.com/jaredpalmer)) - [Vercel](https://vercel.com)
