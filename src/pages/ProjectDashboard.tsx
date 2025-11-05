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
import {
  FiHome,
  FiLayers,
  FiCheckSquare,
  FiZap,
  FiGrid,
  FiArrowLeft,
  FiSettings,
  FiEdit2
} from "react-icons/fi";
import {
  PlanManagementProvider,
  PlanManagementMain
} from "../components/PlanManagement";
import type { Project } from "../shared/types";
import expandIcon from "../assets/sidebar-expand.svg";
import collapseIcon from "../assets/sidebar-collapse.svg";

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

const menuItems: Array<{ key: DashboardTab; label: string; icon: React.ComponentType }> = [
  { key: "overview", label: "总览", icon: FiHome },
  { key: "plan", label: "计划", icon: FiLayers },
  { key: "task", label: "任务", icon: FiCheckSquare },
  { key: "action", label: "动作", icon: FiZap },
  { key: "template", label: "模板", icon: FiGrid }
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
  const [planTotal, setPlanTotal] = useState(stats?.planTotal ?? 0);
  const [templateTotal, setTemplateTotal] = useState(stats?.templateTotal ?? 0);
  const [taskTotal, setTaskTotal] = useState(stats?.taskTotal ?? 0);
  const [actionTotal, setActionTotal] = useState(stats?.actionTotal ?? 0);

  useEffect(() => {
    let cancelled = false;
    const preloadStats = async () => {
      if (!window.api) {
        return;
      }
      try {
        const [plans, tasks, actions] = await Promise.all([
          window.api.getPlans(project.id),
          window.api.getTasks(project.id),
          window.api.getActions(project.id)
        ]);
        if (!cancelled) {
          setPlanTotal(plans.length);
          setTaskTotal(tasks.length);
          setActionTotal(actions.length);
        }
      } catch (error) {
        console.error("加载概览统计数据失败", error);
      }
    };
    void preloadStats();
    return () => {
      cancelled = true;
    };
  }, [project.id]);

  useEffect(() => {
    setPlanTotal(stats?.planTotal ?? 0);
  }, [stats?.planTotal]);

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
      planTotal,
      taskTotal,
      actionTotal,
      templateTotal
    }),
    [planTotal, taskTotal, actionTotal, templateTotal]
  );

  const renderDefaultContent = () => {
    switch (activeTab) {
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

  const isPlanTab = activeTab === "plan";
  const isTaskTab = activeTab === "task";
  const isActionTab = activeTab === "action";

  return (
    <div className="dashboard-shell">
      <header className="dashboard-header">
        <div className="dashboard-header-left">
          <button
            type="button"
            className="icon-button"
            onClick={onBack}
            aria-label="返回项目列表"
            title="返回项目列表"
          >
            <FiArrowLeft />
          </button>
          <h1 className="dashboard-title">{project.name}</h1>
        </div>
        <div className="dashboard-header-actions">
          <button
            type="button"
            className="icon-button"
            onClick={() => onEditProject?.(project)}
            aria-label="编辑项目"
            title="编辑项目"
          >
            <FiEdit2 />
          </button>
          <button
            type="button"
            className="icon-button"
            onClick={onOpenSettings}
            aria-label="系统设置"
            title="系统设置"
          >
            <FiSettings />
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
            {!leftCollapsed ? <span>导航</span> : null}
            <button
              type="button"
              className="sidebar-toggle"
              onClick={() => setLeftCollapsed((prev) => !prev)}
              aria-label={leftCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            >
              <img src={leftCollapsed ? expandIcon : collapseIcon} alt="" />
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
                  {React.createElement(item.icon)}
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
                  {!rightCollapsed ? <span>Template Library</span> : null}
                  <button
                    type="button"
                    className="sidebar-toggle"
                    onClick={() => setRightCollapsed((prev) => !prev)}
                    aria-label={rightCollapsed ? "Expand sidebar" : "Collapse sidebar"}
                  >
                    <img src={rightCollapsed ? collapseIcon : expandIcon} alt="" />
                  </button>
                </div>
                {!rightCollapsed ? <ActionTemplatePanel /> : null}
              </aside>
            </>
          </ActionManagementProvider>
        ) : isPlanTab ? (
          <PlanManagementProvider
            projectId={project.id}
            onTotalChange={(total) => {
              setPlanTotal(total);
            }}
          >
            <>
              <main className="dashboard-content">
                <PlanManagementMain />
              </main>
              <aside
                className={
                  rightCollapsed
                    ? "dashboard-right dashboard-right--collapsed"
                    : "dashboard-right"
                }
              >
                <div className="dashboard-sidebar__header">
                  {!rightCollapsed ? <span>Plan 提示</span> : null}
                  <button
                    type="button"
                    className="sidebar-toggle"
                    onClick={() => setRightCollapsed((prev) => !prev)}
                    aria-label={rightCollapsed ? "Expand sidebar" : "Collapse sidebar"}
                  >
                    <img src={rightCollapsed ? collapseIcon : expandIcon} alt="" />
                  </button>
                </div>
                {!rightCollapsed ? (
                  <div className="dashboard-right__content">
                    在此区域展示 Plan 的执行提示或统计信息。
                  </div>
                ) : null}
              </aside>
            </>
          </PlanManagementProvider>
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
                  {!rightCollapsed ? <span>Task Sidebar</span> : null}
                  <button
                    type="button"
                    className="sidebar-toggle"
                    onClick={() => setRightCollapsed((prev) => !prev)}
                    aria-label={rightCollapsed ? "Expand sidebar" : "Collapse sidebar"}
                  >
                    <img src={rightCollapsed ? collapseIcon : expandIcon} alt="" />
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
                {!rightCollapsed ? <span>Project Notes</span> : null}
                <button
                  type="button"
                  className="sidebar-toggle"
                  onClick={() => setRightCollapsed((prev) => !prev)}
                  aria-label={rightCollapsed ? "Expand sidebar" : "Collapse sidebar"}
                >
                  <img src={rightCollapsed ? collapseIcon : expandIcon} alt="" />
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
