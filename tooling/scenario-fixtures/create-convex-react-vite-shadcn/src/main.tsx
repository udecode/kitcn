import { ConvexProvider, ConvexReactClient } from 'convex/react';
import { ThemeProvider } from 'next-themes';
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.tsx';
import './index.css';

const convex = new ConvexReactClient(import.meta.env.VITE_CONVEX_URL as string);

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ThemeProvider attribute="class">
      <ConvexProvider client={convex}>
        <App />
      </ConvexProvider>
    </ThemeProvider>
  </React.StrictMode>
);
