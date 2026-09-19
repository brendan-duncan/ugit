import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { clipboard, ipcRenderer } from 'electron';
import './TextContextMenu.css';

type TextField = HTMLInputElement | HTMLTextAreaElement;

interface MenuState {
  x: number;
  y: number;
  field: TextField;
  hasSelection: boolean;
  isEditable: boolean;
  canPaste: boolean;
}

const isMac = process.platform === 'darwin';
const accel = (key: string) => (isMac ? `⌘${key}` : `Ctrl+${key}`);

/**
 * Cut/Copy/Paste on right-click for a text input or textarea.
 *
 * The edits go through the window's own editing commands rather than through
 * the field's value, so they land in the same undo stack as typing and fire the
 * input event React's onChange listens for - the caller's state stays in sync
 * without this hook knowing anything about it.
 *
 * Usage:
 *   const { textMenu, openTextMenu } = useTextContextMenu();
 *   <input onContextMenu={openTextMenu} />
 *   {textMenu}
 */
export function useTextContextMenu() {
  const [menu, setMenu] = useState<MenuState | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  const openTextMenu = useCallback((e: React.MouseEvent<TextField>) => {
    e.preventDefault();
    e.stopPropagation();

    const field = e.currentTarget;
    // Right-clicking doesn't reliably move focus, and the editing commands act
    // on whatever is focused, so put the caret in this field first.
    field.focus();

    const start = field.selectionStart ?? 0;
    const end = field.selectionEnd ?? 0;
    setMenu({
      x: e.clientX,
      y: e.clientY,
      field,
      hasSelection: end > start,
      isEditable: !field.disabled && !field.readOnly,
      canPaste: clipboard.readText().length > 0
    });
  }, []);

  const closeMenu = useCallback(() => setMenu(null), []);

  // The commit fields sit at the bottom edge of the window, where a menu drawn
  // downwards from the pointer would fall off-screen. Nudge it back inside
  // before the frame is painted, so it never visibly jumps.
  useLayoutEffect(() => {
    const el = menuRef.current;
    if (!el)
      return;
    const rect = el.getBoundingClientRect();
    if (rect.bottom > window.innerHeight)
      el.style.top = `${Math.max(4, window.innerHeight - rect.height - 4)}px`;
    if (rect.right > window.innerWidth)
      el.style.left = `${Math.max(4, window.innerWidth - rect.width - 4)}px`;
  }, [menu]);

  useEffect(() => {
    if (!menu)
      return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape')
        closeMenu();
    };
    document.addEventListener('mousedown', closeMenu);
    document.addEventListener('keydown', onKeyDown);
    window.addEventListener('blur', closeMenu);
    window.addEventListener('resize', closeMenu);
    return () => {
      document.removeEventListener('mousedown', closeMenu);
      document.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('blur', closeMenu);
      window.removeEventListener('resize', closeMenu);
    };
  }, [menu, closeMenu]);

  const run = (command: 'cut' | 'copy' | 'paste' | 'selectAll') => {
    const field = menu?.field;
    closeMenu();
    if (!field)
      return;
    field.focus();
    ipcRenderer.send('edit-command', command);
  };

  const item = (label: string, key: string, enabled: boolean, command: 'cut' | 'copy' | 'paste' | 'selectAll') => (
    <div
      className={`context-menu-item ${enabled ? '' : 'disabled'}`}
      onClick={enabled ? () => run(command) : undefined}
    >
      {label}
      <span className="context-menu-hotkey">{accel(key)}</span>
    </div>
  );

  const textMenu = menu ? (
    <div
      ref={menuRef}
      className="context-menu text-context-menu"
      style={{ left: menu.x, top: menu.y }}
      // Keep the caret where it is: a mousedown on the menu would otherwise
      // blur the field and the editing commands would have nothing to act on.
      onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); }}
    >
      {item('Cut', 'X', menu.hasSelection && menu.isEditable, 'cut')}
      {item('Copy', 'C', menu.hasSelection, 'copy')}
      {item('Paste', 'V', menu.canPaste && menu.isEditable, 'paste')}
      <div className="context-menu-separator" />
      {item('Select All', 'A', menu.field.value.length > 0, 'selectAll')}
    </div>
  ) : null;

  return { textMenu, openTextMenu };
}

export default useTextContextMenu;
