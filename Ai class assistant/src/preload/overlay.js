'use strict';
const { contextBridge, ipcRenderer } = require('electron');

// Explicit allow-list. The overlay renderer never touches Node directly.
const EVENTS = [
  'state', 'level', 'devices', 'status', 'lag', 'error', 'log',
  'partial', 'turn', 'brain', 'focus-ask', 'no-answer-needed',
  'answer:start', 'answer:delta', 'answer:done', 'answer:error',
  'answer:superseded', 'overlay:clickThrough', 'still-talking', 'interim-answer', 'share',
];

contextBridge.exposeInMainWorld('copilot', {
  on(channel, fn) {
    if (!EVENTS.includes(channel)) return () => {};
    const h = (_e, payload) => fn(payload);
    ipcRenderer.on(channel, h);
    return () => ipcRenderer.removeListener(channel, h);
  },
  state: () => ipcRenderer.invoke('state'),
  startListening: (id) => ipcRenderer.invoke('listen:start', id),
  stopListening: () => ipcRenderer.invoke('listen:stop'),
  pause: () => ipcRenderer.invoke('listen:pause'),
  resume: () => ipcRenderer.invoke('listen:resume'),
  ask: (q) => ipcRenderer.invoke('brain:ask', q),
  suggest: () => ipcRenderer.invoke('brain:suggest'),
  repeat: () => ipcRenderer.invoke('brain:repeat'),
  note: (t) => ipcRenderer.invoke('note:add', t),
  setSize: (s) => ipcRenderer.invoke('overlay:size', s),
  setClickThrough: (v) => ipcRenderer.invoke('overlay:clickThrough', v),
  setOpacity: (v) => ipcRenderer.invoke('overlay:opacity', v),
  hover: (overControl) => ipcRenderer.send('overlay:hover', overControl),
  hide: () => ipcRenderer.invoke('overlay:hide'),
  openDashboard: () => ipcRenderer.invoke('dashboard:open'),
});
