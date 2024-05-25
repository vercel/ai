<template>
    <div class="flex flex-col w-full max-w-md py-24 mx-auto stretch">
        <div v-if="error" class="relative px-6 py-4 text-white bg-red-500 rounded-md">
            <span class="block sm:inline">Error: {{ error.toString() }}</span>
        </div>

        <div v-for="m in messages" :key="m.id" class="whitespace-pre-wrap" :style="{ color: roleToColorMap[m.role] }">
            <strong>{{ `${m.role}: ` }}</strong>
            <span v-if="m.role !== 'data'">{{ m.content }}</span>
            <span v-else>
                {{ m.data.description }}
                <br />
                <pre class="bg-gray-200">{{ JSON.stringify(m.data, null, 2) }}</pre>
            </span>
            <br />
            <br />
        </div>

        <div v-if="status === 'in_progress'"
            class="w-full h-8 max-w-md p-2 mb-8 bg-gray-300 rounded-lg dark:bg-gray-600 animate-pulse"></div>

        <form @submit.prevent="submitMessage">
            <input ref="inputRef" :disabled="status !== 'awaiting_message'"
                class="fixed w-full max-w-md p-2 mb-8 border border-gray-300 rounded shadow-xl bottom-14 ax-w-md"
                v-model="input" placeholder="What is the temperature in the living room?" @input="handleInputChange" />
        </form>

        <button class="fixed bottom-0 w-full max-w-md p-2 mb-8 text-white bg-red-500 rounded-lg" @click="stop">
            Stop
        </button>
    </div>
</template>

<script setup>
import { useAssistant } from 'ai/vue';

const roleToColorMap = {
    system: 'red',
    user: 'black',
    function: 'blue',
    tool: 'purple',
    assistant: 'green',
    data: 'orange',
};

const {
    status,
    messages,
    input,
    submitMessage,
    handleInputChange,
    error,
    stop,
} = useAssistant({ api: '/api/assistant' });

const inputRef = ref(null);

onMounted(() => {
    watch(
        () => status.value,
        (newStatus) => {
            if (newStatus === 'awaiting_message') {
                inputRef.value?.focus();
            }
        }
    );
});
</script>

<style scoped>
.bg-gray-200 {
    background-color: #e2e8f0;
}
</style>