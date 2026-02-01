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
          {React.Children.map(children, (child) => 
            cloneElement(child as React.ReactElement<any>, { onClick: () => handleItemClick((child as any).props.onClick) })
          )}
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

export { DropdownMenu, DropdownItem, DropdownSeparator };