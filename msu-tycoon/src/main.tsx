import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { DebugPage } from './debug/DebugPage';
import './debug/debug.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <DebugPage />
  </StrictMode>,
);
