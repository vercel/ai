'use client';

import { useState } from 'react';

export default function Page() {
  const [response, setResponse] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleClick = async () => {
    setIsLoading(true);
    const response = await fetch('/api/mcp', {
      method: 'POST',
      body: JSON.stringify({
        prompt: 'Can you find a product called The Product?',
      }),
    });
    const data = await response.json();
    setResponse(data.text);
    setIsLoading(false);
  };

  return (
    <div className="flex flex-col items-center justify-center h-screen gap-4">
      <button
        className="bg-blue-500 text-white p-2 rounded-md"
        onClick={handleClick}
        disabled={isLoading}
      >
        {isLoading ? 'Searching...' : 'Find Product'}
      </button>
      {response && <p>Result: {response}</p>}
    </div>
  );
}
