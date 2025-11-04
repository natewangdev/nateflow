import React from "react";
import AppHeader from "../components/AppHeader";
import ProjectCard from "../components/ProjectCard";
import ContextMenu, { ContextMenuOption } from "../components/ContextMenu";
import type { Project } from "../shared/types";

interface ProjectListPageProps {
  projects: Project[];
  loading: boolean;
  contextMenu: {
    visible: boolean;
    x: number;
    y: number;
    options: ContextMenuOption[];
  } | null;
  onGridContextMenu: (event: React.MouseEvent<HTMLDivElement>) => void;
  onCardContextMenu: (event: React.MouseEvent, project: Project) => void;
  onCardClick: (project: Project) => void;
  onCreateProject: () => void;
  onOpenSettings: () => void;
}

const ProjectListPage: React.FC<ProjectListPageProps> = ({
  projects,
  loading,
  contextMenu,
  onGridContextMenu,
  onCardContextMenu,
  onCardClick,
  onCreateProject,
  onOpenSettings
}) => {
  return (
    <div className="app-shell">
      <AppHeader onOpenSettings={onOpenSettings} />
      <main
        className="project-grid"
        onContextMenu={onGridContextMenu}
        style={{ position: "relative" }}
      >
        {loading && projects.length === 0 ? (
          <div className="empty-placeholder">正在载入项目...</div>
        ) : null}
        {!loading && projects.length === 0 ? (
          <div className="empty-placeholder">
            <span>暂无项目，右键空白处或点击下方按钮快速创建一个新项目。</span>
            <button className="primary-button" onClick={onCreateProject}>
              新建项目
            </button>
          </div>
        ) : null}
        {projects.map((project) => (
          <ProjectCard
            key={project.id}
            project={project}
            onClick={onCardClick}
            onContextMenu={onCardContextMenu}
          />
        ))}
      </main>
      {contextMenu?.visible ? (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          options={contextMenu.options}
        />
      ) : null}
    </div>
  );
};

export default ProjectListPage;
