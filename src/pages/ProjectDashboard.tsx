import React, { useEffect, useMemo, useState } from "react";
import TemplateManagement from "../components/TemplateManagement";
import {
  ActionManagementProvider,
  ActionManagementMain,
  ActionTemplatePanel
} from "../components/ActionManagement";
import type { Project } from "../shared/types";

type DashboardTab = "overview" | "plan" | "task" | "action" | "template";

interface DashboardStats {
  planTotal: number;
  taskTotal: number;
  actionTotal: number;
  templateTotal: number;
}

interface ProjectDashboardProps {
  project: Project;
  stats?: Partial<DashboardStats>;
  onBack?: () => void;
  onOpenSettings?: () => void;
  onEditProject?: (project: Project) => void;
  onTemplateTotalChange?: (total: number) => void;
}

const menuItems: Array<{ key: DashboardTab; label: string; icon: string }> = [
  { key: "overview", label: "概览", icon: "📊" },
  { key: "plan", label: "计划管理", icon: "🗂" },
  { key: "task", label: "任务管理", icon: "✅" },
  { key: "action", label: "Action 管理", icon: "⚙️" },
  { key: "template", label: "模板管理", icon: "📚" }
];

const ProjectDashboard: React.FC<ProjectDashboardProps> = ({
  project,
  stats,
  onBack,
  onOpenSettings,
  onEditProject,
  onTemplateTotalChange
}) => {
  const [activeTab, setActiveTab] = useState<DashboardTab>("overview");
  const [leftCollapsed, setLeftCollapsed] = useState(false);
  const [rightCollapsed, setRightCollapsed] = useState(true);
  const [templateTotal, setTemplateTotal] = useState(stats?.templateTotal ?? 0);
  const [actionTotal, setActionTotal] = useState(stats?.actionTotal ?? 0);

  useEffect(() => {
    setTemplateTotal(stats?.templateTotal ?? 0);
  }, [stats?.templateTotal]);

  useEffect(() => {
    setActionTotal(stats?.actionTotal ?? 0);
  }, [stats?.actionTotal]);

  useEffect(() => {
    if (activeTab === "action") {
      setRightCollapsed(false);
    }
  }, [activeTab]);

  const mergedStats: DashboardStats = useMemo(
    () => ({
      planTotal: stats?.planTotal ?? 0,
      taskTotal: stats?.taskTotal ?? 0,
      actionTotal,
      templateTotal
    }),
    [stats, actionTotal, templateTotal]
  );

  const renderNonActionContent = () => {
    switch (activeTab) {
      case "plan":
        return (
          <div className="dashboard-panel">
            计划管理区块暂未实现，可用于展示计划列表、状态筛选与批量操作。
          </div>
        );
      case "task":
        return (
          <div className="dashboard-panel">
            任务管理区块暂未实现，可展示任务清单、执行进度以及分配信息。
          </div>
        );
      case "template":
        return (
          <TemplateManagement
            onTotalChange={(total) => {
              setTemplateTotal(total);
              onTemplateTotalChange?.(total);
            }}
          />
        );
      case "overview":
      default:
        return (
          <div className="dashboard-overview-grid">
            <div className="dashboard-overview-card">
              <span className="dashboard-overview-label">计划数量</span>
              <strong className="dashboard-overview-value">{mergedStats.planTotal}</strong>
            </div>
            <div className="dashboard-overview-card">
              <span className="dashboard-overview-label">任务数量</span>
              <strong className="dashboard-overview-value">{mergedStats.taskTotal}</strong>
            </div>
            <div className="dashboard-overview-card">
              <span className="dashboard-overview-label">Action 数量</span>
              <strong className="dashboard-overview-value">{mergedStats.actionTotal}</strong>
            </div>
            <div className="dashboard-overview-card">
              <span className="dashboard-overview-label">模板数量</span>
              <strong className="dashboard-overview-value">{mergedStats.templateTotal}</strong>
            </div>
          </div>
        );
    }
  };

  const isActionTab = activeTab === "action";

  return (
    <div className="dashboard-shell">
      <header className="dashboard-header">
        <div className="dashboard-header-left">
          <button className="secondary-button" onClick={onBack}>
            返回项目
          </button>
          <h1 className="dashboard-title">{project.name}</h1>
        </div>
        <div className="dashboard-header-actions">
          <button className="secondary-button" onClick={() => onEditProject?.(project)}>
            编辑项目
          </button>
          <button className="icon-button" onClick={onOpenSettings}>
            ⚙️ 设置
          </button>
        </div>
      </header>
      <div className="dashboard-body">
        <aside
          className={
            leftCollapsed
              ? "dashboard-sidebar dashboard-sidebar--collapsed"
              : "dashboard-sidebar"
          }
        >
          <div className="dashboard-sidebar__header">
            <span>功能区</span>
            <button
              className="sidebar-toggle"
              onClick={() => setLeftCollapsed((prev) => !prev)}
            >
              {leftCollapsed ? "展开" : "收起"}
            </button>
          </div>
          <nav className="dashboard-menu">
            {menuItems.map((item) => (
              <div
                key={item.key}
                className={
                  activeTab === item.key
                    ? "dashboard-menu__item dashboard-menu__item--active"
                    : "dashboard-menu__item"
                }
                onClick={() => setActiveTab(item.key)}
                title={leftCollapsed ? item.label : undefined}
              >
                <span className="dashboard-menu__icon" aria-hidden="true">
                  {item.icon}
                </span>
                {!leftCollapsed ? <span>{item.label}</span> : null}
              </div>
            ))}
          </nav>
        </aside>
        {isActionTab ? (
          <ActionManagementProvider
            projectId={project.id}
            onTotalChange={(total) => {
              setActionTotal(total);
            }}
          >
            <>
              <main className="dashboard-content">
                <ActionManagementMain />
              </main>
              <aside
                className={
                  rightCollapsed
                    ? "dashboard-right dashboard-right--collapsed"
                    : "dashboard-right"
                }
              >
                <div className="dashboard-sidebar__header">
                  <span>模板列表</span>
                  <button
                    className="sidebar-toggle"
                    onClick={() => setRightCollapsed((prev) => !prev)}
                  >
                    {rightCollapsed ? "展开" : "收起"}
                  </button>
                </div>
                {!rightCollapsed ? <ActionTemplatePanel /> : null}
              </aside>
            </>
          </ActionManagementProvider>
        ) : (
          <>
            <main className="dashboard-content">{renderNonActionContent()}</main>
            <aside
              className={
                rightCollapsed
                  ? "dashboard-right dashboard-right--collapsed"
                  : "dashboard-right"
              }
            >
              <div className="dashboard-sidebar__header">
                <span>辅助信息</span>
                <button
                  className="sidebar-toggle"
                  onClick={() => setRightCollapsed((prev) => !prev)}
                >
                  {rightCollapsed ? "展开" : "收起"}
                </button>
              </div>
              {!rightCollapsed ? (
                <div className="dashboard-right__content">
                  这里可以展示项目动态、团队信息或其他常用小组件。
                </div>
              ) : null}
            </aside>
          </>
        )}
      </div>
    </div>
  );
};

export default ProjectDashboard;
