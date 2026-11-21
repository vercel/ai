// React DOM 19 exposes this entry point; the app uses the React DOM 18 types.
declare module 'react-dom/server.edge' {
  export { renderToReadableStream } from 'react-dom/server';
}
