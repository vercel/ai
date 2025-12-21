# AI SDK - TypeDriver

This package provides unified validation and type inference for the [JSON Schema](https://json-schema.org/) and [Standard JSON Schema](https://standardschema.dev/json-schema) specifications as well as a TypeScript definition DSL. The package is designed primarily for multi language systems that require sharable schematics and consistent validation behaviors based on JSON Schema [semantics](https://github.com/json-schema-org/JSON-Schema-Test-Suite).

Project: [TypeDriver](https://github.com/sinclairzx81/typedriver)

## Setup

```bash
npm install @ai-sdk/typedriver
```

## Usage

This package exports a single `schema(...)` function that accepts a wide range of schema definitions and libraries. The function returns instances of `Schema<T>` from the `@ai-sdk/provider-utils` package, which can be passed to SDK interfaces that accept schemas.

```typescript
import { schema } from '@ai-sdk/typedriver';
import { anthropic } from '@ai-sdk/anthropic';
import { generateText, Output } from 'ai';

const Vector3 = schema(`{ 
  x: number,
  y: number,
  z: number
}`)                                               // const Vector3: Schema<{
                                                  //   x: number;
                                                  //   y: number;
                                                  //   z: number;
                                                  // }>

const result = await generateText({
  model: anthropic('claude-3-7-sonnet-latest'),
  output: Output.object({ schema: Vector3 }),
  prompt: 'Generate normal Vector.',
});
```

## With TypeScript

```ts
import { schema } from '@ai-sdk/typedriver';

const Vector3 = schema(`{
  x: number,
  y: number,
  z: number
}`)
```

## With JSON Schema

```ts
import { schema } from '@ai-sdk/typedriver';

const Vector3 = schema({
  type: 'object',
  required: [ 'x', 'y', 'z'],
  properties: {
    x: { type: 'number' },
    y: { type: 'number' },
    z: { type: 'number' }
  }
})
```

## With Zod

```ts
import { schema } from '@ai-sdk/typedriver';
import * as z from 'zod';

const Vector3 = schema(z.object({
  x: z.number(),
  y: z.number(),
  z: z.number()
}))
```

## With ArkType

```ts
import { schema } from '@ai-sdk/typedriver';
import { type } from 'arktype';

const Vector3 = schema(type({
  x: 'number',
  y: 'number',
  z: 'number'
}))
```

## With Valibot

```ts
import { schema } from '@ai-sdk/typedriver';
import * as v from 'valibot';
import { toStandardJsonSchema } from '@valibot/to-json-schema';

const Vector3 = schema(toStandardJsonSchema(v.object({
  x: v.number(),
  y: v.number(),
  z: v.number()
})))
```