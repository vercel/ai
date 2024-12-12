<script setup lang="ts">
import { useChat } from '@ai-sdk/vue';

const { input, messages, append } = useChat({
  api: '/api/chat',
});

const files = ref<FileList | null>(null);
const fileInputRef = ref<HTMLInputElement | null>(null);

const submit = () => {
  append(
    { role: 'user', content: input.value },
    {
      experimental_attachments: files.value ?? undefined,
    },
  );

  input.value = '';
  fileInputRef.value!.value = '';
  files.value = null;
};

const filesWithUrl = computed(() => {
  if (!files.value) return [];

  return Array.from(files.value).map(file => ({
    file,
    url: URL.createObjectURL(file),
  }));
});
</script>

<template>
  <div class="flex flex-col w-full max-w-md py-24 mx-auto stretch">
    <div
      v-for="message in messages"
      :key="message.id"
      class="whitespace-pre-wrap"
    >
      <strong>{{ `${message.role}: ` }}</strong>
      {{ message.content }}

      <div v-if="message.experimental_attachments" class="flex flex-row gap-2">
        <img
          v-for="(attachment, index) in message.experimental_attachments"
          :key="`${message.id}-${index}`"
          :src="attachment.url"
          class="rounded-md size-20"
        />
      </div>
    </div>

    <form
      @submit.prevent="submit"
      class="fixed bottom-0 flex flex-col max-w-md gap-2 mb-8"
    >
      <div class="flex flex-row gap-2">
        <img
          v-for="file in filesWithUrl"
          :key="file.file.name"
          :src="file.url"
          class="rounded-md size-20"
        />
      </div>
      <input
        ref="fileInputRef"
        type="file"
        accept="image/*"
        multiple
        @change="files = ($event.target as HTMLInputElement).files"
      />
      <input
        class="w-full p-2 border border-gray-300 rounded shadow-xl"
        v-model="input"
        placeholder="Say something..."
      />
    </form>
  </div>
</template>
