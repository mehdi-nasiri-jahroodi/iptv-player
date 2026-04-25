import { type RouteConfig, index, route } from '@react-router/dev/routes';

const devOnlyRoutes =
  import.meta.env.DEV === true
    ? [route('dev/design-tokens', './routes/dev.design-tokens.tsx')]
    : [];

export default [
  index('./app.tsx'),
  route('about', './routes/about.tsx'),
  ...devOnlyRoutes,
] satisfies RouteConfig;