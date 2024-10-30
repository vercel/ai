# AI SDK Swarm Examples

Basic examples for the experimental, unstable, unmaintained `@ai-sdk/swarm` package.

## Usage

1. Create .env file with the following content (and more settings, depending on the providers you want to use):

```sh
OPENAI_API_KEY="YOUR_OPENAI_API_KEY"
...
```

2. Run the following commands from the root directory of the AI SDK repo:

```sh
pnpm install
pnpm build
```

3. Run any example (from the `examples/swarm` directory) with the following command:

```sh
pnpm tsx src/path/to/example.ts
```
