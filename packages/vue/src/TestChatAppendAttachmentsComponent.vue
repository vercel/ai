<script setup lang="ts">
import { useChat } from './use-chat';

const { messages, append } = useChat();
</script>

<template>
  <div>
    <div v-for="(m, idx) in messages" :key="m.id" :data-testid="`message-${idx}`">
      {{ m.role === 'user' ? 'User: ' : 'AI: ' }}
      {{ m.content }}
      <template v-if="m.experimental_attachments">
        <template v-for="attachment in m.experimental_attachments" :key="attachment.name">
          <img
            v-if="attachment.contentType?.startsWith('image/')"
            :src="attachment.url"
            :alt="attachment.name"
            :data-testid="`attachment-${idx}`"
          />
        </template>
      </template>
    </div>

    <button
      data-testid="do-append"
      @click="
        append(
          {
            role: 'user',
            content: 'Message with image attachment',
          },
          {
            experimental_attachments: [
              {
                name: 'test.png',
                contentType: 'image/png',
                url: 'https://example.com/image.png',
              },
            ],
          },
        )
      "
    />
  </div>
</template>
