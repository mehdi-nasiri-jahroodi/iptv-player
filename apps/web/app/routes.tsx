import { type RouteConfig, index, route } from '@react-router/dev/routes';

const devOnlyRoutes =
  import.meta.env.DEV === true
    ? [
        route('dev/design-tokens', './pages/dev/design-tokens.tsx'),
        route('dev/play-test', './pages/dev/play-test.tsx'),
      ]
    : [];

export default [
  index('./pages/home.tsx'),
  route('about', './pages/about.tsx'),
  route('add-source', './pages/add-source.tsx'),
  route('browse/:kind', './pages/browse/$kind.tsx'),
  ...devOnlyRoutes,
] satisfies RouteConfig;
