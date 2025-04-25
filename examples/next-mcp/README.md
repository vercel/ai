# AI SDK, Next.js, and MCP Example

This example shows how to use the [AI SDK](https://sdk.vercel.ai/docs) with [Next.js](https://nextjs.org/) and [Model Context Protocol (MCP)](https://modelcontextprotocol.io/).

## How to use

Execute [`create-next-app`](https://github.com/vercel/next.js/tree/canary/packages/create-next-app) with [npm](https://docs.npmjs.com/cli/init), [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/), or [pnpm](https://pnpm.io) to bootstrap the example:

```bash
npx create-next-app --example https://github.com/vercel/ai/tree/main/examples/next-mcp next-mcp-app
```

```bash
yarn create next-app --example https://github.com/vercel/ai/tree/main/examples/next-mcp next-mcp-app
```

```bash
pnpm create next-app --example https://github.com/vercel/ai/tree/main/examples/next-mcp next-mcp-app
```

To run the example locally you need to:

1. Sign up at [OpenAI's Developer Platform](https://platform.openai.com/signup).
2. Go to [OpenAI's dashboard](https://platform.openai.com/account/api-keys) and create an API KEY.
3. Set the required environment variable as the token value as shown [the example env file](./.env.local.example) but in a new file called `.env.local`
4. `pnpm install` to install the required dependencies.
5. `pnpm dev` to launch the development server.

## Learn More

To learn more about MCP, Next.js, and the AI SDK take a look at the following resources:

- [AI SDK docs](https://sdk.vercel.ai/docs)
- [Model Context Protocol docs](https://modelcontextprotocol.io/)
- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
