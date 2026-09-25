import '@fontsource/playfair-display/400.css';
import '@fontsource/playfair-display/500.css';
import '@fontsource/playfair-display/600.css';
import '@fontsource/playfair-display/700.css';
import '@fontsource/plus-jakarta-sans/400.css';
import '@fontsource/plus-jakarta-sans/500.css';
import '@fontsource/plus-jakarta-sans/600.css';
import '@fontsource/plus-jakarta-sans/700.css';
import '@fontsource/noto-sans-lao/400.css';
import '@fontsource/noto-sans-lao/500.css';
import '@fontsource/noto-sans-lao/600.css';
import '@fontsource/noto-sans-lao/700.css';
import '@fontsource/noto-serif-lao/400.css';
import '@fontsource/noto-serif-lao/500.css';
import '@fontsource/noto-serif-lao/600.css';
import '@fontsource/noto-serif-lao/700.css';
import './index.css';

import React from 'react';
import ReactDOM from 'react-dom/client';

import App from './App';
import { AppProviders } from './app/providers';
import { env } from './config/env';
import './i18n';

async function enableMocking(): Promise<void> {
  if (!env.enableMocks) {
    console.warn(
      `[web-admin] mocks DISABLED — calling real backend at ${env.apiBaseUrl}. ` +
        'Set VITE_ENABLE_MOCKS=true in apps/web-admin/.env.local to use the mock API.',
    );
    return;
  }
  const { startMockWorker } = await import('./mocks/browser');
  await startMockWorker();
}

void enableMocking().then(() => {
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <AppProviders>
        <App />
      </AppProviders>
    </React.StrictMode>,
  );
});
