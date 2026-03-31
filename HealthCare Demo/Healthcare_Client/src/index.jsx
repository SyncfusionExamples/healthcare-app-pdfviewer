import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';
import './app.css';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('No root element found. Ensure public/index.html contains <div id="root"></div>');
}
createRoot(rootElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
