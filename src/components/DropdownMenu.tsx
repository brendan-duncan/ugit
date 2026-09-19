import React, { useState, useRef, useEffect, useLayoutEffect, ReactNode, cloneElement } from 'react';
import './DropdownMenu.css';

interface DropdownMenuProps {
  trigger: ReactNode;
  children: ReactNode;
}

function DropdownMenu({ trigger, children }: DropdownMenuProps): React.ReactElement {
  const [isOpen, setIsOpen] = useState<boolean>(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Hang the menu off the viewport rather than off the trigger: these menus are
  // long enough to run past the bottom of a laptop screen, and only the viewport
  // knows how much room is left. Anything that still doesn't fit scrolls.
  useLayoutEffect(() => {
    if (!isOpen)
      return;

    const place = () => {
      const anchor = triggerRef.current;
      const list = listRef.current;
      if (!anchor || !list)
        return;
      const rect = anchor.getBoundingClientRect();
      const top = rect.bottom + 2;
      list.style.top = `${top}px`;
      list.style.right = `${Math.max(4, window.innerWidth - rect.right)}px`;
      list.style.maxHeight = `${Math.max(120, window.innerHeight - top - 8)}px`;
    };

    place();
    window.addEventListener('resize', place);
    return () => window.removeEventListener('resize', place);
  }, [isOpen]);

  // A fixed menu doesn't travel with the trigger, so close it if anything behind
  // it scrolls. Scrolling the menu's own list is the one case that doesn't count.
  useEffect(() => {
    if (!isOpen)
      return;
    const handleScroll = (event: Event) => {
      if (listRef.current && listRef.current.contains(event.target as Node))
        return;
      setIsOpen(false);
    };
    window.addEventListener('scroll', handleScroll, true);
    return () => window.removeEventListener('scroll', handleScroll, true);
  }, [isOpen]);

  const handleToggle = (): void => {
    setIsOpen(!isOpen);
  };

  const handleItemClick = (callback?: () => void): void => {
    if (callback) callback();
    setIsOpen(false);
  };

  return (
    <div className="dropdown" ref={menuRef}>
      <div className="dropdown-trigger" ref={triggerRef} onClick={handleToggle}>
        {trigger}
      </div>
      {isOpen && (
        <div className="dropdown-menu" ref={listRef}>
          {React.Children.map(children, (child) => {
            // Conditional entries ({cond && <Item />}) arrive as null; leave them out.
            if (!React.isValidElement(child))
              return null;
            const element = child as React.ReactElement<any>;
            // Don't add click handler to DropdownSeparator
            if (element.type === DropdownSeparator) {
              return element;
            }
            // Pass close handler to DropdownSubmenu
            if (element.type === DropdownSubmenu) {
              return cloneElement(element, { onItemClick: () => setIsOpen(false) });
            }
            return cloneElement(element, { onClick: () => handleItemClick(element.props.onClick) });
          })}
        </div>
      )}
    </div>
  );
}

interface DropdownItemProps {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
}

function DropdownItem({ children, onClick, disabled = false }: DropdownItemProps): React.ReactElement {
  return (
    <div 
      className={`dropdown-item ${disabled ? 'disabled' : ''}`}
      onClick={!disabled ? onClick : undefined}
    >
      {children}
    </div>
  );
};

function DropdownSeparator(): React.ReactElement {
  return <div className="dropdown-separator"></div>;
};

interface DropdownSubmenuProps {
  label: string;
  children: ReactNode;
  onItemClick?: () => void;
}

function DropdownSubmenu({ label, children, onItemClick }: DropdownSubmenuProps): React.ReactElement {
  const [isSubmenuOpen, setIsSubmenuOpen] = useState<boolean>(false);
  const submenuRef = useRef<HTMLDivElement>(null);
  const rowRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  // Fixed, like the menu it hangs off, so a scrolling parent menu can't clip it.
  // It stays a DOM child of the row so moving onto it doesn't count as leaving.
  useLayoutEffect(() => {
    if (!isSubmenuOpen)
      return;
    const row = rowRef.current;
    const content = contentRef.current;
    if (!row || !content)
      return;

    const rect = row.getBoundingClientRect();
    // Horizontally the submenu clears the parent menu, not the row: the row
    // stops short of the menu's scrollbar, and starting there would cover it.
    const parent = row.closest('.dropdown-menu')?.getBoundingClientRect();
    const leftEdge = parent ? parent.left : rect.left;
    const rightEdge = parent ? parent.right : rect.right;

    content.style.left = `${rightEdge + 2}px`;
    content.style.top = `${rect.top}px`;
    content.style.maxHeight = `${window.innerHeight - 8}px`;

    const bounds = content.getBoundingClientRect();
    if (bounds.bottom > window.innerHeight)
      content.style.top = `${Math.max(4, window.innerHeight - bounds.height - 4)}px`;
    // No room to the right: fall back to opening towards the left of the menu.
    if (bounds.right > window.innerWidth)
      content.style.left = `${Math.max(4, leftEdge - bounds.width - 2)}px`;
  }, [isSubmenuOpen]);

  // The submenu is placed from the row's position, so scrolling the parent menu
  // would strand it; close instead of chasing.
  useEffect(() => {
    if (!isSubmenuOpen)
      return;
    const close = () => setIsSubmenuOpen(false);
    window.addEventListener('scroll', close, true);
    return () => window.removeEventListener('scroll', close, true);
  }, [isSubmenuOpen]);

  const handleSubmenuItemClick = (callback?: () => void) => {
    if (callback) callback();
    if (onItemClick) onItemClick();
  };

  return (
    <div
      className="dropdown-submenu"
      ref={submenuRef}
      onMouseEnter={() => setIsSubmenuOpen(true)}
      onMouseLeave={() => setIsSubmenuOpen(false)}
    >
      <div className="dropdown-item dropdown-submenu-trigger" ref={rowRef}>
        {label}
        <span className="dropdown-submenu-arrow">▶</span>
      </div>
      {isSubmenuOpen && (
        <div className="dropdown-submenu-content" ref={contentRef}>
          {React.Children.map(children, (child) => {
            // Conditional entries ({cond && <Item />}) arrive as null; leave them out.
            if (!React.isValidElement(child))
              return null;
            const element = child as React.ReactElement<any>;
            // Don't add click handler to DropdownSeparator
            if (element.type === DropdownSeparator) {
              return element;
            }
            return cloneElement(element, { onClick: () => handleSubmenuItemClick(element.props.onClick) });
          })}
        </div>
      )}
    </div>
  );
}

export { DropdownMenu, DropdownItem, DropdownSeparator, DropdownSubmenu };
