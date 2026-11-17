import React from 'react';
import ReactDOM from 'react-dom/client';
import { PopupProvider } from '@salutejs/sdds-finai';
import '@sddsjs/sdds_finai/css/sdds_finai_default__light.css';
import App from './App';
import { DemoContract } from './DemoContract';
import './styles.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <PopupProvider>{location.pathname === '/contracts/demo-041' ? <DemoContract /> : <App />}</PopupProvider>
  </React.StrictMode>,
);
