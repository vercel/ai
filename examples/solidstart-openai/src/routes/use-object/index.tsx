import { experimental_useObject as useObject } from '@ai-sdk/solid';
import { notificationSchema } from '../api/use-object/schema';
import { For, Show } from 'solid-js';

export default function Page() {
  const { submit, isLoading, object, stop, error } = useObject({
    api: '/api/use-object',
    schema: notificationSchema,
  });

  return (
    <div class="flex flex-col items-center min-h-screen p-4 m-4">
      <button
        class="px-4 py-2 mt-4 text-white bg-blue-500 rounded-md disabled:bg-blue-200"
        onClick={async () => {
          submit('Messages during finals week.');
        }}
        disabled={isLoading()}
      >
        Generate notifications
      </button>

      <Show when={error()}>
        {error => (
          <div class="mt-4 text-red-500">
            An error occurred. {error()?.message}
          </div>
        )}
      </Show>

      <Show when={isLoading()}>
        <div class="mt-4 text-gray-500">
          <div>Loading...</div>
          <button
            type="button"
            class="px-4 py-2 mt-4 text-blue-500 border border-blue-500 rounded-md"
            onClick={() => stop()}
          >
            STOP
          </button>
        </div>
      </Show>

      <div class="flex flex-col gap-4 mt-4">
        <For each={object()?.notifications}>
          {(notification, index) => (
            <div
              class="flex items-start gap-4 p-4 bg-gray-100 rounded-md dark:bg-gray-800"
              data-index={index()}
            >
              <div class="flex-1 space-y-1">
                <div class="flex items-center justify-between">
                  <p class="font-medium dark:text-white">
                    {notification?.name}
                  </p>
                  <p class="text-sm text-gray-500 dark:text-gray-400">
                    {notification?.minutesAgo}
                    {notification?.minutesAgo != null ? ' minutes ago' : ''}
                  </p>
                </div>
                <p class="text-gray-700 dark:text-gray-300">
                  {notification?.message}
                </p>
              </div>
            </div>
          )}
        </For>
      </div>
    </div>
  );
}
