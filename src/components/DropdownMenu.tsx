import React, { useState, useRef, useEffect, ReactNode, cloneElement } from 'react';
import './DropdownMenu.css';

interface DropdownMenuProps {
  trigger: ReactNode;
  children: ReactNode;
}

function DropdownMenu({ trigger, children }: DropdownMenuProps): React.ReactElement {
  const [isOpen, setIsOpen] = useState<boolean>(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleToggle = (): void => {
    setIsOpen(!isOpen);
  };

  const handleItemClick = (callback?: () => void): void => {
    if (callback) callback();
    setIsOpen(false);
  };

  return (
    <div className="dropdown" ref={menuRef}>
      <div className="dropdown-trigger" onClick={handleToggle}>
        {trigger}
      </div>
      {isOpen && (
        <div className="dropdown-menu">
          {React.Children.map(children, (child) => {
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
      <div className="dropdown-item dropdown-submenu-trigger">
        {label}
        <span className="dropdown-submenu-arrow">▶</span>
      </div>
      {isSubmenuOpen && (
        <div className="dropdown-submenu-content">
          {React.Children.map(children, (child) => {
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