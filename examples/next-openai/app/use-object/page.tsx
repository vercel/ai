'use client';

import { experimental_useObject as useObject } from 'ai/react';
import { notificationSchema } from '../api/use-object/schema';

export default function Page() {
  const { setInput, object } = useObject({
    api: '/api/use-object',
    schema: notificationSchema,
  });

  return (
    <div className="flex flex-col items-center min-h-screen p-4 m-4">
      <button
        className="px-4 py-2 mt-4 text-white bg-blue-500 rounded-md"
        onClick={async () => {
          setInput('Messages during finals week.');
        }}
      >
        Generate notifications
      </button>

      <div className="flex flex-col gap-4 mt-4">
        {object?.notifications?.map((notification, index) => (
          <div
            className="flex items-start gap-4 p-4 bg-gray-100 rounded-md dark:bg-gray-800"
            key={index}
          >
            <div className="flex-1 space-y-1">
              <div className="flex items-center justify-between">
                <p className="font-medium">{notification?.name}</p>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  {notification?.minutesAgo}
                  {notification?.minutesAgo != null ? ' minutes ago' : ''}
                </p>
              </div>
              <p className="text-gray-700 dark:text-gray-300">
                {notification?.message}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
