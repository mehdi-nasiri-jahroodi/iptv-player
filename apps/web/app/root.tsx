import {
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
  type MetaFunction,
  type LinksFunction,
} from 'react-router';

import './styles/index.css';
import { AppNav } from './layout/app-nav';
import { AutoTheme } from './layout/auto-theme';
import { SpatialNavigationRoot } from './layout/spatial-navigation-root';
import { ResponsibilityNotice } from './components/responsibility-notice';

export const meta: MetaFunction = () => [
  {
    title: 'Lumina-IPTV (web)',
  },
];

export const links: LinksFunction = () => [
  { rel: "preconnect", href: "https://fonts.googleapis.com" },
  {
    rel: "preconnect",
    href: "https://fonts.gstatic.com",
    crossOrigin: "anonymous",
  },
  {
    rel: "stylesheet",
    href: "https://fonts.googleapis.com/css2?family=Inter:ital,opsz,wght@0,14..32,100..900;1,14..32,100..900&display=swap",
  },
];

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <Meta />
        <Links />
      </head>
      <body>
        {/* Restore path encoded by public/404.html after a GitHub Pages redirect. */}
        <script dangerouslySetInnerHTML={{ __html: `
          (function() {
            var p = window.location.search.match(/[?&]p=([^&]*)/);
            var q = window.location.search.match(/[?&]q=([^&]*)/);
            if (p) {
              var path = '/' + p[1];
              var search = q ? '?' + q[1] : '';
              var hash = window.location.hash;
              window.history.replaceState(null, null, path + search + hash);
            }
          })();
        `}} />
        <AutoTheme />
        <SpatialNavigationRoot>
          <AppNav />
          <main className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <ResponsibilityNotice />
            {children}
          </main>
        </SpatialNavigationRoot>
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

export default function App() {
    return <Outlet />;
}
