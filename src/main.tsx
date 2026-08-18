import React from 'react';
import ReactDOM from 'react-dom/client';
import { MotionConfig } from 'framer-motion';
import { App } from './app/App';
import { RuntimeRouter } from './app/RuntimeRouter';
import { AppProvider } from './state/AppContext';
import './styles/tokens.css';
import './styles/reset.css';
import './styles/global.css';

const rootElement: HTMLElement | null = document.getElementById('root');

if (rootElement === null) {
  throw new Error('未找到应用根节点 #root');
}

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <MotionConfig reducedMotion="user">
      <RuntimeRouter>
        <AppProvider>
          <App />
        </AppProvider>
      </RuntimeRouter>
    </MotionConfig>
  </React.StrictMode>,
);
