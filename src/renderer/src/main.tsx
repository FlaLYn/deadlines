import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
// theme.css defines every colour token; the other sheets consume them. Overrides last.
import './styles/theme.css';
import './styles/theme-overrides.css';
import './styles/globals.css';
import './styles/management.css';
import './styles/desktop.css';
import { applyTheme, readTheme, watchSystemTheme } from './theme';

// Lets the stylesheet clear the macOS traffic lights without probing the DOM.
document.body.classList.add(`platform-${window.deadlines.platform}`);

// Applied before render so the first paint is already the right theme.
applyTheme(readTheme());
watchSystemTheme();

createRoot(document.getElementById('root') as HTMLElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
