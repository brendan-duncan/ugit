import { ipcRenderer } from 'electron';

// Thin wrappers over the main-process IPC for OS integration. Paths must be ABSOLUTE.
export function showInExplorer(absPath: string): void {
  ipcRenderer.invoke('show-item-in-folder', absPath);
}
export function openInEditor(absPath: string): void {
  ipcRenderer.invoke('open-in-editor', absPath);
}
export function openInConsole(absPath: string): void {
  ipcRenderer.invoke('open-in-console', absPath);
}
