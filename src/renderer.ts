import '@fontsource-variable/inter';
import './index.css';
import React from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './renderer/App';
import { flushAllSaves, saveSession } from './renderer/save-flush';

const el = document.getElementById('root');
if (!el) throw new Error('Missing #root element');

void window.lychee.invoke("save.startSession", { session: saveSession }).then(() => {
window.__lycheeFlushSaves = flushAllSaves;
createRoot(el).render(
  React.createElement(
    React.StrictMode,
    null,
    React.createElement(App, null, null),
  ),
);

}).catch((error) => {
  console.error("Could not initialize saving", error);
  el.textContent = "Could not initialize saving. Please reopen Lychee.";
});
