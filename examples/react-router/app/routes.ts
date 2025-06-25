import { type RouteConfig, index, route } from '@react-router/dev/routes';

export default [
  index('routes/home.tsx'),
  route('api/chat', 'routes/api.chat.ts'),
  route('api/streamObject', 'routes/api.streamObject.ts'),
  route('useObject', 'routes/useObject.tsx'),
] satisfies RouteConfig;
