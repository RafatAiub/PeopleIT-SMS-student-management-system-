import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import App from './App';
import { isSiteHost } from './site/host';

// A request on a school's own domain (or platform subdomain) renders that
// school's public website instead of the dashboard app. Kept lazy so the
// dashboard bundle never loads the site renderer and vice versa.
const SiteHostApp = React.lazy(() => import('./site/PublicSite').then((m) => ({ default: m.SiteHostApp })));
const onSiteHost = isSiteHost(window.location.hostname);
import './styles/index.css';
import { registerServiceWorker } from './pwa/registerServiceWorker';

registerServiceWorker();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: false,
    },
  },
});

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        {onSiteHost ? (
          <React.Suspense fallback={null}>
            <SiteHostApp />
          </React.Suspense>
        ) : (
          <App />
        )}
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>
);
