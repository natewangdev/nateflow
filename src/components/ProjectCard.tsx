import React from "react";
import type { Project } from "../shared/types";

interface ProjectCardProps {
  project: Project;
  onClick?: (project: Project) => void;
  onContextMenu?: (event: React.MouseEvent, project: Project) => void;
}

const ProjectCard: React.FC<ProjectCardProps> = ({
  project,
  onClick,
  onContextMenu
}) => {
  const handleClick = () => {
    onClick?.(project);
  };

  const handleContextMenu = (event: React.MouseEvent) => {
    event.preventDefault();
    onContextMenu?.(event, project);
  };

  return (
    <div
      className="project-card"
      data-card="true"
      onClick={handleClick}
      onContextMenu={handleContextMenu}
    >
      <div className="project-card__thumb">
        {project.imageBase64 ? (
          <img src={project.imageBase64} alt={`${project.name} 项目封面`} />
        ) : (
          <span className="project-card__placeholder" role="img" aria-label="项目封面占位">
            📁
          </span>
        )}
      </div>
      <div className="project-card__body">
        <h3 className="project-card__name">{project.name}</h3>
      </div>
    </div>
  );
};

export default ProjectCard;
