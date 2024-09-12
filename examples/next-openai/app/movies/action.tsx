'use server';

import { createStreamableUI } from 'ai/rsc';

import React from 'react';

const MovieItem = () => {
  return (
    <div
      className="block p-4 text-white bg-blue-500"
      style={{
        animation: 'fadeIn 0.5s ease-in-out',
      }}
    >
      <h2 className="text-xl font-bold">Movie Title</h2>
      <p className="mt-2">
        This is a placeholder for movie description. It will be replaced with
        actual content later.
      </p>
    </div>
  );
};

export async function getMovies() {
  const movieUi = createStreamableUI(null);

  setTimeout(() => {
    movieUi.update(<MovieItem />);
  }, 1000);

  setTimeout(() => {
    movieUi.append(<MovieItem />);
  }, 2000);

  setTimeout(() => {
    movieUi.append(<MovieItem />);
    movieUi.done();
  }, 3000);

  return movieUi.value;
}
