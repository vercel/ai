# AI SDK - React Server Components integration

[React Server Components](https://react.dev/reference/rsc/server-components) for the [AI SDK](https://ai-sdk.dev/docs):

## Setup

```bash
npm i @ai-sdk/rsc
```

## Usage

```tsx
'use server';

import { createStreamableUI } from '@ai-sdk/rsc';

export async function getWeather() {
  const weatherUI = createStreamableUI();

  weatherUI.update(<div style={{ color: 'gray' }}>Loading...</div>);

  setTimeout(() => {
    weatherUI.done(<div>It&apos;s a sunny day!</div>);
  }, 1000);

  return weatherUI.value;
}
```

See the [React Server Components documentation](https://ai-sdk.dev/docs/ai-sdk-rsc/overview) for more information.
