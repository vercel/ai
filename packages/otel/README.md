# AI SDK - OpenTelemetry

The **OpenTelemetry integration** for the [AI SDK](https://ai-sdk.dev/docs)
collects tracing spans for AI SDK calls and sends them through your configured
OpenTelemetry setup.

## Setup

```bash
npm i ai @ai-sdk/otel
```

## Skill for Coding Agents

If you use coding agents such as Claude Code or Cursor, we highly recommend
adding the AI SDK skill to your repository:

```shell
npx skills add vercel/ai
```

## Usage

```ts
import { OpenTelemetry } from '@ai-sdk/otel';
import { registerTelemetry } from 'ai';

registerTelemetry(new OpenTelemetry());
```

See the [OpenTelemetry documentation](https://ai-sdk.dev/docs/ai-sdk-core/telemetry) for more information.
