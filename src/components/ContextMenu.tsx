import React from "react";

export interface ContextMenuOption {
  key: string;
  label: string;
  onClick: () => void;
  danger?: boolean;
}

interface ContextMenuProps {
  x: number;
  y: number;
  options: ContextMenuOption[];
}

const ContextMenu: React.FC<ContextMenuProps> = ({ x, y, options }) => {
  return (
    <div
      className="context-menu"
      style={{ top: y, left: x }}
      onContextMenu={(event) => event.preventDefault()}
      onMouseDown={(event) => event.stopPropagation()}
    >
      {options.map((option) => (
        <div
          key={option.key}
          className="context-menu__item"
          style={option.danger ? { color: "#ef4444" } : undefined}
          onClick={option.onClick}
        >
          {option.label}
        </div>
      ))}
    </div>
  );
};

export default ContextMenu;
