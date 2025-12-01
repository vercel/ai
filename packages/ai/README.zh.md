![hero illustration](./assets/hero.gif)

# AI SDK

[AI SDK](https://ai-sdk.dev/docs) 是一个 TypeScript 工具包，帮助你使用 Next.js、React、Svelte、Vue 等常见框架以及 Node.js 等运行时构建由人工智能驱动的应用与智能体。

想进一步了解如何使用 AI SDK，请查阅我们的 [API 参考](https://ai-sdk.dev/docs/reference) 与 [文档](https://ai-sdk.dev/docs)。

## 安装

在本地开发环境中，你需要准备 Node.js 18+ 以及 npm（或其他包管理器）。

```shell
npm install ai
```

## 统一的提供方架构

AI SDK 提供一个[统一的 API](https://ai-sdk.dev/docs/foundations/providers-and-models)，用于与 [OpenAI](https://ai-sdk.dev/providers/ai-sdk-providers/openai)、[Anthropic](https://ai-sdk.dev/providers/ai-sdk-providers/anthropic)、[Google](https://ai-sdk.dev/providers/ai-sdk-providers/google-generative-ai) 等模型提供方以及[更多伙伴](https://ai-sdk.dev/providers/ai-sdk-providers)集成。

```shell
npm install @ai-sdk/openai @ai-sdk/anthropic @ai-sdk/google
```

你也可以选择使用 [Vercel AI Gateway](https://vercel.com/docs/ai-gateway)。

## 使用方式

### 生成文本

```ts
import { generateText } from 'ai';

const { text } = await generateText({
  model: 'openai/gpt-5', // 使用 Vercel AI Gateway
  prompt: 'What is an agent?',
});
```

```ts
import { generateText } from 'ai';
import { openai } from '@ai-sdk/openai';

const { text } = await generateText({
  model: openai('gpt-5'), // 使用 OpenAI Responses API
  prompt: 'What is an agent?',
});
```

### 生成结构化数据

```ts
import { generateObject } from 'ai';
import { z } from 'zod';

const { object } = await generateObject({
  model: 'openai/gpt-4.1',
  schema: z.object({
    recipe: z.object({
      name: z.string(),
      ingredients: z.array(z.object({ name: z.string(), amount: z.string() })),
      steps: z.array(z.string()),
    }),
  }),
  prompt: 'Generate a lasagna recipe.',
});
```

### 智能体

```ts
import { ToolLoopAgent } from 'ai';

const sandboxAgent = new ToolLoopAgent({
  model: 'openai/gpt-5-codex',
  system: 'You are an agent with access to a shell environment.',
  tools: {
    local_shell: openai.tools.localShell({
      execute: async ({ action }) => {
        const [cmd, ...args] = action.command;
        const sandbox = await getSandbox(); // Vercel Sandbox
        const command = await sandbox.runCommand({ cmd, args });
        return { output: await command.stdout() };
      },
    }),
  },
});
```

### UI 集成

[AI SDK UI](https://ai-sdk.dev/docs/ai-sdk-ui/overview) 模块提供一组 Hook，帮助你构建聊天机器人和生成式界面。这些 Hook 与框架无关，可用于 Next.js、React、Svelte 与 Vue。

根据所使用的框架，安装对应的包，例如：

```shell
npm install @ai-sdk/react
```

#### 智能体 @/agent/image-generation-agent.ts

```ts
import { openai } from '@ai-sdk/openai';
import { ToolLoopAgent, InferAgentUIMessage } from 'ai';

export const imageGenerationAgent = new ToolLoopAgent({
  model: openai('gpt-5'),
  tools: {
    image_generation: openai.tools.imageGeneration({
      partialImages: 3,
    }),
  },
});

export type ImageGenerationAgentMessage = InferAgentUIMessage<
  typeof imageGenerationAgent
>;
```

#### 路由（Next.js App Router）@/app/api/chat/route.ts

```tsx
import { imageGenerationAgent } from '@/agent/image-generation-agent';
import { createAgentUIStreamResponse } from 'ai';

export async function POST(req: Request) {
  const { messages } = await req.json();

  return createAgentUIStreamResponse({
    agent: imageGenerationAgent,
    messages,
  });
}
```

#### 针对工具的 UI 组件 @/component/image-generation-view.tsx

```tsx
import { openai } from '@ai-sdk/openai';
import { UIToolInvocation } from 'ai';

export default function ImageGenerationView({
  invocation,
}: {
  invocation: UIToolInvocation<ReturnType<typeof openai.tools.imageGeneration>>;
}) {
  switch (invocation.state) {
    case 'input-available':
      return <div>Generating image...</div>;
    case 'output-available':
      return <img src={`data:image/png;base64,${invocation.output.result}`} />;
  }
}
```

#### 页面 @/app/page.tsx

```tsx
'use client';

import { ImageGenerationAgentMessage } from '@/agent/image-generation-agent';
import ImageGenerationView from '@/component/image-generation-view';
import { useChat } from '@ai-sdk/react';

export default function Page() {
  const { messages, status, sendMessage } =
    useChat<ImageGenerationAgentMessage>();

  const [input, setInput] = useState('');
  const handleSubmit = e => {
    e.preventDefault();
    sendMessage({ text: input });
    setInput('');
  };

  return (
    <div>
      {messages.map(message => (
        <div key={message.id}>
          <strong>{`${message.role}: `}</strong>
          {message.parts.map((part, index) => {
            switch (part.type) {
              case 'text':
                return <div key={index}>{part.text}</div>;
              case 'tool-image_generation':
                return <ImageGenerationView key={index} invocation={part} />;
            }
          })}
        </div>
      ))}

      <form onSubmit={handleSubmit}>
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          disabled={status !== 'ready'}
        />
      </form>
    </div>
  );
}
```

## 模板

我们提供了多个[模板](https://ai-sdk.dev/docs/introduction#templates)，覆盖不同使用场景、模型提供方与框架，帮助你快速启动 AI 应用。

## 社区

AI SDK 社区位于 [GitHub Discussions](https://github.com/vercel/ai/discussions)，欢迎你提出问题、分享想法或作品。

## 参与贡献

我们非常欢迎对 AI SDK 的贡献。开始之前，请先阅读我们的[贡献指南](https://github.com/vercel/ai/blob/main/CONTRIBUTING.md)，以确保能顺利协作。

## 作者

该库由 [Vercel](https://vercel.com) 和 [Next.js](https://nextjs.org) 团队成员创建，并得到了[开源社区](https://github.com/vercel/ai/graphs/contributors)的贡献。
