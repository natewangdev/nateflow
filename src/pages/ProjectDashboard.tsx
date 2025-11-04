import React, { useEffect, useMemo, useState } from "react";
import TemplateManagement from "../components/TemplateManagement";
import {
  ActionManagementProvider,
  ActionManagementMain,
  ActionTemplatePanel
} from "../components/ActionManagement";
import {
  TaskManagementProvider,
  TaskManagementMain
} from "../components/TaskManagement";
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
  { key: "overview", label: "Overview", icon: "O" },
  { key: "plan", label: "Plans", icon: "P" },
  { key: "task", label: "Tasks", icon: "T" },
  { key: "action", label: "Actions", icon: "A" },
  { key: "template", label: "Templates", icon: "M" }
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
  const [taskTotal, setTaskTotal] = useState(stats?.taskTotal ?? 0);
  const [actionTotal, setActionTotal] = useState(stats?.actionTotal ?? 0);

  useEffect(() => {
    setTemplateTotal(stats?.templateTotal ?? 0);
  }, [stats?.templateTotal]);

  useEffect(() => {
    setTaskTotal(stats?.taskTotal ?? 0);
  }, [stats?.taskTotal]);

  useEffect(() => {
    setActionTotal(stats?.actionTotal ?? 0);
  }, [stats?.actionTotal]);

  useEffect(() => {
    if (activeTab === "action") {
      setRightCollapsed(false);
    }
  }, [activeTab]);

  useEffect(() => {
    if (activeTab !== "action") {
      setRightCollapsed(true);
    }
  }, [activeTab]);

  const mergedStats: DashboardStats = useMemo(
    () => ({
      planTotal: stats?.planTotal ?? 0,
      taskTotal,
      actionTotal,
      templateTotal
    }),
    [stats, taskTotal, actionTotal, templateTotal]
  );

  const renderDefaultContent = () => {
    switch (activeTab) {
      case "plan":
        return (
          <div className="dashboard-panel">
            Plan management is coming soon.
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
              <span className="dashboard-overview-label">Plans</span>
              <strong className="dashboard-overview-value">{mergedStats.planTotal}</strong>
            </div>
            <div className="dashboard-overview-card">
              <span className="dashboard-overview-label">Tasks</span>
              <strong className="dashboard-overview-value">{mergedStats.taskTotal}</strong>
            </div>
            <div className="dashboard-overview-card">
              <span className="dashboard-overview-label">Actions</span>
              <strong className="dashboard-overview-value">{mergedStats.actionTotal}</strong>
            </div>
            <div className="dashboard-overview-card">
              <span className="dashboard-overview-label">Templates</span>
              <strong className="dashboard-overview-value">{mergedStats.templateTotal}</strong>
            </div>
          </div>
        );
    }
  };

  const isTaskTab = activeTab === "task";
  const isActionTab = activeTab === "action";

  return (
    <div className="dashboard-shell">
      <header className="dashboard-header">
        <div className="dashboard-header-left">
          <button className="secondary-button" onClick={onBack}>
            Back to Projects
          </button>
          <h1 className="dashboard-title">{project.name}</h1>
        </div>
        <div className="dashboard-header-actions">
          <button className="secondary-button" onClick={() => onEditProject?.(project)}>
            Edit Project
          </button>
          <button className="icon-button" onClick={onOpenSettings}>
            ⚙ Settings
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
            <span>Navigation</span>
            <button
              className="sidebar-toggle"
              onClick={() => setLeftCollapsed((prev) => !prev)}
            >
              {leftCollapsed ? "Expand" : "Collapse"}
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
                  <span>Template Library</span>
                  <button
                    className="sidebar-toggle"
                    onClick={() => setRightCollapsed((prev) => !prev)}
                  >
                    {rightCollapsed ? "Expand" : "Collapse"}
                  </button>
                </div>
                {!rightCollapsed ? <ActionTemplatePanel /> : null}
              </aside>
            </>
          </ActionManagementProvider>
        ) : isTaskTab ? (
          <TaskManagementProvider
            projectId={project.id}
            onTotalChange={(total) => {
              setTaskTotal(total);
            }}
          >
            <>
              <main className="dashboard-content">
                <TaskManagementMain />
              </main>
              <aside
                className={
                  rightCollapsed
                    ? "dashboard-right dashboard-right--collapsed"
                    : "dashboard-right"
                }
              >
                <div className="dashboard-sidebar__header">
                  <span>Task Sidebar</span>
                  <button
                    className="sidebar-toggle"
                    onClick={() => setRightCollapsed((prev) => !prev)}
                  >
                    {rightCollapsed ? "Expand" : "Collapse"}
                  </button>
                </div>
                {!rightCollapsed ? (
                  <div className="dashboard-right__content">
                    Task insights will appear here in a future update.
                  </div>
                ) : null}
              </aside>
            </>
          </TaskManagementProvider>
        ) : (
          <>
            <main className="dashboard-content">{renderDefaultContent()}</main>
            <aside
              className={
                rightCollapsed
                  ? "dashboard-right dashboard-right--collapsed"
                  : "dashboard-right"
              }
            >
              <div className="dashboard-sidebar__header">
                <span>Project Notes</span>
                <button
                  className="sidebar-toggle"
                  onClick={() => setRightCollapsed((prev) => !prev)}
                >
                  {rightCollapsed ? "Expand" : "Collapse"}
                </button>
              </div>
              {!rightCollapsed ? (
                <div className="dashboard-right__content">
                  Use this area to capture project highlights or reminders.
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
