import { type RouteConfig, index, route } from '@react-router/dev/routes';

const devOnlyRoutes =
  import.meta.env.DEV === true
    ? [route('dev/design-tokens', './pages/dev/design-tokens.tsx')]
    : [];

export default [
  index('./pages/home.tsx'),
  route('about', './pages/about.tsx'),
  route('add-source', './pages/add-source.tsx'),
  ...devOnlyRoutes,
] satisfies RouteConfig;
