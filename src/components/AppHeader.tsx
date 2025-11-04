import React from "react";

interface AppHeaderProps {
  onOpenSettings: () => void;
}

const AppHeader: React.FC<AppHeaderProps> = ({ onOpenSettings }) => {
  return (
    <header className="app-header">
      <div className="app-header__info">
        <h1 className="app-title">NateFlow 项目中心</h1>
        <p className="app-subtitle">
          为自动化脚本引擎准备结构化输入，快速创建与管理项目，保持统一的设计语调。
        </p>
      </div>
      <button className="icon-button" onClick={onOpenSettings}>
        <span aria-hidden="true">⚙️</span>
        <span>系统设置</span>
      </button>
    </header>
  );
};

export default AppHeader;
