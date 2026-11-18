# AI SDK - Vue.js integration

[Vue.js](https://vuejs.org/) UI components for the [AI SDK](https://ai-sdk.dev/docs):

## Setup

```bash
npm i ai @ai-sdk/vue
```

## Usage

```typescript
<script setup lang="ts">
import { useChat } from "@ai-sdk/vue";
import { ref } from "vue";

const input = ref("");
const { messages, sendMessage } = useChat();

const handleSubmit = (e: Event) => {
    e.preventDefault();
    sendMessage({ text: input.value });
    input.value = "";
};
</script>

<template>
    <div>
        <div v-for="(m, index) in messages" :key="m.id ? m.id : index">
            {{ m.role === "user" ? "User: " : "AI: " }}
            <div
                v-for="(part, index) in m.parts"
                :key="`${m.id}-${part.type}-${index}`"
            >
                <div v-if="part.type === 'text'">{{ part.text }}</div>
            </div>
        </div>

        <form @submit="handleSubmit">
            <input v-model="input" placeholder="Say something..." />
        </form>
    </div>
</template>
```

See the [Vue.js documentation](https://ai-sdk.dev/docs/getting-started/nuxt) for more information.
