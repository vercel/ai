# AI SDK, Next.js, and OpenAI Chat Example

This example shows how to use the [AI SDK](https://ai-sdk.dev/docs) with [Next.js](https://nextjs.org/) and [OpenAI](https://openai.com) to create a ChatGPT-like AI-powered streaming chat bot.

## Deploy your own

Deploy the example using [Vercel](https://vercel.com?utm_source=github&utm_medium=readme&utm_campaign=ai-sdk-example):

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fvercel%2Fai%2Ftree%2Fmain%2Fexamples%2Fnext-openai&env=OPENAI_API_KEY&project-name=ai-sdk-next-openai&repository-name=ai-sdk-next-openai)

## How to use

Execute [`create-next-app`](https://github.com/vercel/next.js/tree/canary/packages/create-next-app) with [npm](https://docs.npmjs.com/cli/init), [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/), or [pnpm](https://pnpm.io) to bootstrap the example:

```bash
npx create-next-app --example https://github.com/vercel/ai/tree/main/examples/ai-e2e-next next-openai-app
```

```bash
yarn create next-app --example https://github.com/vercel/ai/tree/main/examples/ai-e2e-next next-openai-app
```

```bash
pnpm create next-app --example https://github.com/vercel/ai/tree/main/examples/ai-e2e-next next-openai-app
```

To run the example locally you need to:

1. Sign up at [OpenAI's Developer Platform](https://platform.openai.com/signup).
2. Go to [OpenAI's dashboard](https://platform.openai.com/account/api-keys) and create an API KEY.
3. If you choose to use external files for attachments, then create a [Vercel Blob Store](https://vercel.com/docs/storage/vercel-blob).
4. Set the required environment variable as the token value as shown [the example env file](./.env.local.example) but in a new file called `.env.local`
5. `pnpm install` to install the required dependencies.
6. `pnpm dev` to launch the development server.

## Local shell

The `/chat/openai-local-shell`, `/chat/openai-shell`, and
`/chat/openai-shell-skills` demos each share one sandbox across local chats.
Their API routes are available only in local
development and reject production, Vercel
deployments (including `vercel dev`), non-loopback Host headers, forwarded external
clients, and cross-origin browser requests before reading messages or invoking
the agent. Run `pnpm dev`, which binds to `127.0.0.1`, and keep the server on
loopback. Do not expose it through a public interface or tunnel; request headers
cannot authenticate callers.

For deployed use, authenticate callers, allocate sandboxes per authorized user or
chat, verify ownership when retrieving them, and clean them up. Tool approval
does not establish ownership of a sandbox.

Run the route regression tests with `pnpm test:local-shell`.

## Code execution file downloads

Anthropic code execution file downloads (including Anthropic on Microsoft) and
OpenAI/Azure container file downloads are available only in local development.
`pnpm dev` binds to `127.0.0.1`; keep the
development server on loopback and open `http://127.0.0.1:3000`. Download routes
reject production, Vercel deployments (including `vercel dev`), non-loopback Host
headers, forwarded external clients, and cross-origin browser requests before
using provider credentials. The loopback bind is the network access control;
request headers cannot prove that a non-browser client is local. Do not expose
the development server through a public interface or tunnel, including a proxy
that rewrites the client address and Host to loopback values.

To support downloads in a deployed application, add authentication and verify
that the requested file belongs to a chat the user can access before contacting
the provider. A file ID alone does not authorize a download.

Run the download route regression tests with `pnpm test:downloads`.

## Learn More

To learn more about OpenAI, Next.js, and the AI SDK take a look at the following resources:

- [AI SDK docs](https://ai-sdk.dev/docs)
- [Vercel AI Playground](https://ai-sdk.dev/playground)
- [OpenAI Documentation](https://platform.openai.com/docs) - learn about OpenAI features and API.
- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
