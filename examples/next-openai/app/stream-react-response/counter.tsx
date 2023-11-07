'use client';

import { useState } from 'react';

export function Counter() {
  const [count, setCount] = useState(0);

  return (
    <div>
      <p>Count: {count}</p>
      <button
        className="bg-black p-0.5 rounded text-white"
        onClick={() => setCount(count + 1)}
      >
        Increment
      </button>
      <button
        className="bg-gray-600 p-0.5 rounded text-white "
        onClick={() => setCount(count - 1)}
      >
        Decrement
      </button>
    </div>
  );
}
