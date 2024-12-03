# AI SDK, Next.js, and Google Vertex AI Edge Example

This example shows how to use the [AI SDK](https://sdk.vercel.ai/docs) with [Next.js](https://nextjs.org/) and [Google Vertex AI](https://cloud.google.com/vertex-ai) to validate that the AI SDK's Google Vertex provider can run successfully in the Edge runtime.

## Deploy your own

Deploy the example using [Vercel](https://vercel.com?utm_source=github&utm_medium=readme&utm_campaign=ai-sdk-example):

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fvercel%2Fai%2Ftree%2Fmain%2Fexamples%2Fnext-google-vertex-edge&env=GOOGLE_API_KEY&project-name=ai-sdk-vertex-edge&repository-name=ai-sdk-vertex-edge)

## How to use

Execute [`create-next-app`](https://github.com/vercel/next.js/tree/canary/packages/create-next-app) with [npm](https://docs.npmjs.com/cli/init), [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/), or [pnpm](https://pnpm.io) to bootstrap the example:

```bash
npx create-next-app --example https://github.com/vercel/ai/tree/main/examples/next-google-vertex-edge next-vertex-edge-app
```

To run the example locally you need to:

1. Set up a [Google Cloud Project](https://cloud.google.com/resource-manager/docs/creating-managing-projects)
2. Enable the [Vertex AI API](https://cloud.google.com/vertex-ai/docs/start/cloud-console)
3. Create a [service account and download credentials](https://cloud.google.com/docs/authentication/getting-started)
4. Set the required environment variables as shown in `.env.local.example`
5. `pnpm install` to install the required dependencies
6. `pnpm dev` to launch the development server

## Learn More

To learn more about Google Vertex AI, Next.js, and the AI SDK take a look at the following resources:

- [AI SDK docs](https://sdk.vercel.ai/docs)
- [Vercel AI Playground](https://play.vercel.ai)
- [Google Vertex AI Documentation](https://cloud.google.com/vertex-ai/docs) - learn about Vertex AI features and API
- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API
