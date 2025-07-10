# ai-sdk-ng

> [!WARNING]
> This is an experimental version not ready for production.

**ai-sdk-ng** is an Angular library that provides seamless integration with [Vercel AI SDK v5 (beta)](https://vercel.com/blog/vercel-ai-sdk-v5) for building AI-powered apps in Angular. It offers chat, text completion, and structured output capabilities with reactive state management and type-safe schema validation.

This project was generated using the [Angular CLI](https://github.com/angular/angular-cli) and supports Angular **16 or higher**.

---

## Features

- **Chat API**: Easily build interactive chat UIs powered by Vercel AI SDK v5.
- **Text Completion**: Generate text using LLMs (Large Language Models).
- **Structured Output**: Stream and validate structured JSON responses from AI APIs with [Zod](https://zod.dev/) schema support.
- **Reactive State**: Built-in loading, error, and result state for Angular templates using signals.

---

## Getting Started

### Installation

```bash
npm install ai-sdk-ng
```

### Usage

Import the classes you need from the library’s public API:

```typescript
import { Chat, Completion, StructuredObject } from 'ai-sdk-ng';
```

---

## Development

### Building

To build the library:

```bash
npm run build
```

Build artifacts are placed in `dist/ai-sdk-ng/`.

---

## Testing

### Unit Tests

```bash
npm run test
```

---

## Additional Resources

- [Vercel AI SDK v5 (beta)](https://vercel.com/blog/vercel-ai-sdk-v5)
- [Angular CLI Overview and Command Reference](https://angular.dev/tools/cli)
- [Zod Schema Validation](https://zod.dev)
- [Angular Documentation](https://angular.dev/)

---

## License

Apache License, Version 2.0
