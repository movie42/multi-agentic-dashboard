const { contextBridge, ipcRenderer } = require("electron");

// Sandboxed preloads cannot be ES modules, hence .cjs.
contextBridge.exposeInMainWorld("agentControl", {
  notify: (payload) => ipcRenderer.send("agent-control:notify", payload),
  onOpenAgent: (callback) => {
    const listener = (_event, agentId) => callback(agentId);
    ipcRenderer.on("agent-control:open-agent", listener);
    return () => ipcRenderer.removeListener("agent-control:open-agent", listener);
  },
});
