'use client';

import { useRef, useEffect } from 'react';

export function ClientInfo({ children }) {
  const renderCounter = useRef(1);

  useEffect(() => {
    renderCounter.current += 1;
    return () => {
      // Clean up double-effects during strict mode
      renderCounter.current -= 1;
    };
  });

  return (
    <div>
      <p>(Rendered {renderCounter.current} times)</p>
      {children}
    </div>
  );
}
