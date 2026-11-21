import React from 'react';
import ReactDOM from 'react-dom/client';
import { runDomainMove } from './storage/domain-move';
import './ui/pwa-install';
import './index.css';

async function start() {
  if (await runDomainMove()) return;
  const { default: App } = await import('./App');
  const rootElement = document.getElementById('root');
  if (!rootElement) {
    throw new Error('Failed to find root element');
  }

  ReactDOM.createRoot(rootElement).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
}

void start();
