'use client';

import { useEffect, useState } from 'react';

export function ClientInfo({ children }) {
  const [renders, setRenders] = useState(0);

  // Increment the render count whenever the children change.
  // This can be used to verify that the component is re-rendered with the
  // state kept.
  useEffect(() => {
    setRenders(r => r + 1);
  }, [children]);

  return (
    <div>
      <p>{renders > 1 ? '(Rerendered) ' : ''}</p>
      {children}
    </div>
  );
}
