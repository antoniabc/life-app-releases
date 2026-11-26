// Jedyne, co apka dostaje od powłoki na PC.
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("lifeDesktop", {
  setMini: (value) => ipcRenderer.send("mini", !!value),
  close: () => ipcRenderer.send("close"),
  googleSignIn: () => ipcRenderer.invoke("google-sign-in"),
});
