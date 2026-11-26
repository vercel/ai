import { defineEnvVars } from '@sveltejs/kit/env';

// The key is read from the environment when the app starts. Returning the value
// unchanged keeps it optional, so builds and `svelte-kit sync` work without it.
export const variables = defineEnvVars({
  OPENAI_API_KEY: {
    schema: value => value,
  },
});
