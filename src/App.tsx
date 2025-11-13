import React, {
  useCallback,
  useEffect,
  useMemo,
  useState
} from "react";
import {
  HashRouter,
  Routes,
  Route,
  Navigate,
  useNavigate,
  useLocation,
  useParams
} from "react-router-dom";
import ProjectListPage from "./pages/ProjectListPage";
import ProjectDashboard from "./pages/ProjectDashboard";
import ProjectModal from "./components/ProjectModal";
import SettingsDialog from "./components/SettingsDialog";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  AppSettings,
  Project,
  ProjectPayload,
  ThemeMode
} from "./shared/types";
import type { ContextMenuOption } from "./components/ContextMenu";

interface ContextMenuState {
  visible: boolean;
  x: number;
  y: number;
  type: "blank" | "card";
  project?: Project;
}

type DashboardStats = {
  planTotal: number;
  taskTotal: number;
  actionTotal: number;
  templateTotal: number;
};

const applyTheme = (theme: ThemeMode) => {
  document.documentElement.setAttribute("data-theme", theme);
};

const ProjectDashboardRoute: React.FC<{
  projects: Project[];
  onBack: () => void;
  onOpenSettings: () => void;
  onEditProject: (project: Project) => void;
  templateTotal: number;
  onTemplateTotalChange: (total: number) => void;
}> = ({
  projects,
  onBack,
  onOpenSettings,
  onEditProject,
  templateTotal,
  onTemplateTotalChange
}) => {
  const { projectId } = useParams();
  const project = useMemo(
    () => projects.find((item) => item.id === projectId),
    [projects, projectId]
  );
  const stats: DashboardStats = {
    planTotal: 0,
    taskTotal: 0,
    actionTotal: 0,
    templateTotal
  };

  if (!project) {
    return <Navigate to="/" replace />;
  }

  return (
    <ProjectDashboard
      project={project}
      stats={stats}
      onBack={onBack}
      onOpenSettings={onOpenSettings}
      onEditProject={onEditProject}
      onTemplateTotalChange={onTemplateTotalChange}
    />
  );
};

const AppContent: React.FC = () => {
  const api = window.api ?? null;
  const bridgeReady = Boolean(api);
  const queryClient = useQueryClient();
  const [templateTotal, setTemplateTotal] = useState(0);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [projectModal, setProjectModal] = useState<{
    open: boolean;
    mode: "create" | "edit";
    project?: Project;
  }>({
    open: false,
    mode: "create"
  });
  const [settingsOpen, setSettingsOpen] = useState(false);

  const location = useLocation();
  const navigate = useNavigate();
  const ensureApi = useCallback(() => {
    if (!api) {
      throw new Error("系统桥接尚未就绪");
    }
    return api;
  }, [api]);

  const settingsQuery = useQuery({
    queryKey: ["settings"],
    queryFn: () => ensureApi().getSettings(),
    enabled: bridgeReady,
    staleTime: 5 * 60 * 1000
  });

  const projectsQuery = useQuery({
    queryKey: ["projects"],
    queryFn: () => ensureApi().getProjects(),
    enabled: bridgeReady
  });

  const templatesQuery = useQuery({
    queryKey: ["templates"],
    queryFn: () => ensureApi().getTemplates(),
    enabled: bridgeReady
  });

  const projects = projectsQuery.data ?? [];
  const settings = settingsQuery.data ?? null;
  const loadingProjects = projectsQuery.isLoading && projects.length === 0;

  useEffect(() => {
    const theme = settings?.theme;
    if (theme) {
      applyTheme(theme);
    }
  }, [settings?.theme]);

  useEffect(() => {
    if (templatesQuery.data) {
      setTemplateTotal(templatesQuery.data.length);
    }
  }, [templatesQuery.data]);

  const saveProjectMutation = useMutation({
    mutationFn: async (payload: { mode: "create" | "edit"; data: ProjectPayload; id?: string }) => {
      const client = ensureApi();
      if (payload.mode === "create") {
        await client.createProject(payload.data);
      } else if (payload.id) {
        await client.updateProject(payload.id, payload.data);
      }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["projects"] });
    }
  });

  const deleteProjectMutation = useMutation({
    mutationFn: async (projectId: string) => {
      await ensureApi().deleteProject(projectId);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["projects"] });
    }
  });

  const updateSettingsMutation = useMutation({
    mutationFn: async (payload: Partial<AppSettings>) => ensureApi().updateSettings(payload),
    onSuccess: (updated) => {
      applyTheme(updated.theme);
      queryClient.setQueryData(["settings"], updated);
      void queryClient.invalidateQueries({ queryKey: ["projects"] });
      void queryClient.invalidateQueries({ queryKey: ["templates"] });
    }
  });

  useEffect(() => {
    const handleGlobalClick = () => setContextMenu(null);
    window.addEventListener("mousedown", handleGlobalClick);
    window.addEventListener("wheel", handleGlobalClick);
    return () => {
      window.removeEventListener("mousedown", handleGlobalClick);
      window.removeEventListener("wheel", handleGlobalClick);
    };
  }, []);

  useEffect(() => {
    setContextMenu(null);
  }, [location.pathname]);

  const handlePickDirectory = useCallback(async () => {
    if (!api) {
      console.error("window.api 尚未初始化，无法选择目录");
      return null;
    }
    return api.pickDirectory();
  }, [api]);

  const openCreateModal = () => {
    setProjectModal({ open: true, mode: "create" });
    setContextMenu(null);
  };

  const openEditModal = (project: Project) => {
    setProjectModal({ open: true, mode: "edit", project });
    setContextMenu(null);
  };

  const handleGridContextMenu = (event: React.MouseEvent<HTMLDivElement>) => {
    if ((event.target as HTMLElement).closest("[data-card='true']")) {
      return;
    }
    event.preventDefault();
    setContextMenu({
      visible: true,
      x: event.clientX,
      y: event.clientY,
      type: "blank"
    });
  };

  const handleCardContextMenu = (event: React.MouseEvent, project: Project) => {
    event.preventDefault();
    setContextMenu({
      visible: true,
      x: event.clientX,
      y: event.clientY,
      type: "card",
      project
    });
  };

  const handleDeleteProject = async (project: Project) => {
    if (!api) {
      console.error("window.api 尚未初始化，无法删除项目");
      return;
    }
    const confirmed = window.confirm(`确认删除项目「${project.name}」？`);
    if (!confirmed) {
      return;
    }
    try {
      await deleteProjectMutation.mutateAsync(project.id);
    } catch (error) {
      console.error("删除项目失败", error);
      window.alert("删除项目失败，请检查日志。");
    } finally {
      setContextMenu(null);
    }
  };

  const handleSaveProject = async (payload: ProjectPayload) => {
    try {
      await saveProjectMutation.mutateAsync({
        mode: projectModal.mode,
        id: projectModal.project?.id,
        data: payload
      });
      setProjectModal((prev) => ({ ...prev, open: false }));
    } catch (error) {
      console.error("保存项目失败", error);
      window.alert("保存项目失败，请检查日志。");
    }
  };

  const handleSettingsSave = async (data: Partial<AppSettings>) => {
    try {
      await updateSettingsMutation.mutateAsync(data);
      setSettingsOpen(false);
    } catch (error) {
      console.error("保存设置失败", error);
      window.alert("保存设置失败，请检查日志。");
    }
  };

  const navigateToProject = (project: Project) => {
    navigate(`/projects/${project.id}`);
  };

  const menuOptions: ContextMenuOption[] = useMemo(() => {
    if (!contextMenu) {
      return [];
    }
    if (contextMenu.type === "blank") {
      return [
        {
          key: "create",
          label: "新建项目",
          onClick: openCreateModal
        }
      ];
    }
    if (contextMenu.project) {
      return [
        {
          key: "edit",
          label: "编辑项目",
          onClick: () => openEditModal(contextMenu.project as Project)
        },
        {
          key: "delete",
          label: "删除项目",
          danger: true,
          onClick: () => handleDeleteProject(contextMenu.project as Project)
        }
      ];
    }
    return [];
  }, [contextMenu]);

  if (!api) {
    return (
      <div className="app-shell">
        <div className="empty-placeholder">
          <span>系统桥接尚未就绪，请稍候或重启应用。</span>
        </div>
      </div>
    );
  }

  const contextMenuForList = contextMenu
    ? {
        visible: contextMenu.visible,
        x: contextMenu.x,
        y: contextMenu.y,
        options: menuOptions
      }
    : null;

  return (
    <>
      <Routes>
        <Route
          path="/"
          element={
            <ProjectListPage
              projects={projects}
              loading={loadingProjects}
              contextMenu={contextMenuForList}
              onGridContextMenu={handleGridContextMenu}
              onCardContextMenu={handleCardContextMenu}
              onCardClick={navigateToProject}
              onCreateProject={openCreateModal}
              onOpenSettings={() => setSettingsOpen(true)}
            />
          }
        />
        <Route
          path="/projects/:projectId"
          element={
            <ProjectDashboardRoute
              projects={projects}
              onBack={() => navigate("/")}
              onOpenSettings={() => setSettingsOpen(true)}
              onEditProject={openEditModal}
              templateTotal={templateTotal}
              onTemplateTotalChange={(total) => {
                setTemplateTotal(total);
              }}
            />
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>

      <ProjectModal
        open={projectModal.open}
        mode={projectModal.mode}
        project={projectModal.project}
        onClose={() => setProjectModal((prev) => ({ ...prev, open: false }))}
        onSave={handleSaveProject}
      />
      <SettingsDialog
        open={settingsOpen}
        settings={settings}
        onClose={() => setSettingsOpen(false)}
        onSave={handleSettingsSave}
        onPickDirectory={handlePickDirectory}
      />
    </>
  );
};

const App: React.FC = () => (
  <HashRouter>
    <AppContent />
  </HashRouter>
);

export default App;
