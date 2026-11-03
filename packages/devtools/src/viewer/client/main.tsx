import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './app';
import { initializeTheme } from './theme';
import './styles.css';

let storage: Storage | undefined;
try {
  storage = window.localStorage;
} catch {
  storage = undefined;
}

const initialTheme = initializeTheme({
  root: document.documentElement,
  storage,
});

createRoot(document.getElementById('root')!).render(
  <App initialTheme={initialTheme} storage={storage} />,
);
