'use client';

import { useState } from 'react';
import { getMovies } from './action';

export default function Page() {
  const [movies, setMovies] = useState<React.ReactNode | null>(null);

  return (
    <div>
      <style jsx>{`
        @keyframes fadeIn {
          from {
            opacity: 0;
          }
          to {
            opacity: 1;
          }
        }
      `}</style>
      <button
        onClick={async () => {
          const moviesUI = await getMovies();
          setMovies(moviesUI);
        }}
      >
        What&apos;s the weather?
      </button>
      {movies}
    </div>
  );
}
