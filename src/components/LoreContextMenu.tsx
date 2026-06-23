import React, { useEffect, useRef } from 'react';

export interface LoreMenuItem {
  label?: string;
  onClick?: () => void;
  separator?: boolean;
  danger?: boolean;
  disabled?: boolean;
}

interface LoreContextMenuProps {
  x: number;
  y: number;
  items: LoreMenuItem[];
  onClose: () => void;
}

/** A small positioned popup menu used for item context menus and the repository "…" menu. */
function LoreContextMenu({ x, y, items, onClose }: LoreContextMenuProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDown = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) onClose(); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [onClose]);

  // Keep the menu on-screen.
  const left = Math.min(x, window.innerWidth - 220);
  const top = Math.min(y, window.innerHeight - (items.length * 28 + 8));

  return (
    <div ref={ref} className="lore-context-menu" style={{ left, top }}>
      {items.map((item, i) => item.separator ? (
        <div key={i} className="lore-context-sep" />
      ) : (
        <div
          key={i}
          className={`lore-context-item ${item.danger ? 'danger' : ''} ${item.disabled ? 'disabled' : ''}`}
          onClick={() => { if (!item.disabled) { item.onClick?.(); onClose(); } }}
        >
          {item.label}
        </div>
      ))}
    </div>
  );
}

export default LoreContextMenu;
