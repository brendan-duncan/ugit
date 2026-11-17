import { ipcRenderer } from 'electron';

// Electron 44 dropped `clipboard` from the renderer's `electron` module, so
// `require('electron').clipboard` is undefined here and calling it throws. The
// main process still has it, so these go through there. Async on purpose: a
// sendSync answered with a clipboard call deadlocks the renderer.

export function writeText(text: string): Promise<void> {
  return ipcRenderer.invoke('clipboard-write-text', text).catch((err: unknown) => {
    console.error('Failed to write to clipboard:', err);
  });
}

export async function readText(): Promise<string> {
  try {
    return (await ipcRenderer.invoke('clipboard-read-text')) ?? '';
  } catch (err) {
    console.error('Failed to read clipboard:', err);
    return '';
  }
}

export const clipboard = { writeText, readText };
