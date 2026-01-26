import React, { useState, useRef, useEffect } from 'react';
import './DropdownMenu.css';

function DropdownMenu({ trigger, children }) {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleToggle = () => {
    setIsOpen(!isOpen);
  };

  const handleItemClick = (callback) => {
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
            React.cloneElement(child, { onClick: () => handleItemClick(child.props.onClick) })
          )}
        </div>
      )}
    </div>
  );
}

function DropdownItem({ children, onClick, disabled = false }) {
  return (
    <div 
      className={`dropdown-item ${disabled ? 'disabled' : ''}`}
      onClick={!disabled ? onClick : undefined}
    >
      {children}
    </div>
  );
}

function DropdownSeparator() {
  return <div className="dropdown-separator"></div>;
}

export { DropdownMenu, DropdownItem, DropdownSeparator };