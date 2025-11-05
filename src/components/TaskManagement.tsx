import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState
} from "react";
import {
  FiEdit2,
  FiTrash,
  FiTrash2,
  FiSearch,
  FiArrowRight,
  FiX,
  FiArrowUp,
  FiArrowDown,
  FiMaximize2,
  FiMinimize2
} from "react-icons/fi";
import type { Action, Task } from "../shared/types";

interface TaskManagementProviderProps {
  projectId: string;
  onTotalChange?: (total: number) => void;
  children: React.ReactNode;
}

type TaskModalMode = "create" | "edit";

interface ModalState {
  open: boolean;
  mode: TaskModalMode;
  task: Task | null;
}

interface TaskDraft {
  id?: string;
  name: string;
  actionIds: string[];
}

interface TaskContextValue {
  tasks: Task[];
  actions: Action[];
  loadingTasks: boolean;
  loadingActions: boolean;
  refreshTasks: () => Promise<void>;
  refreshActions: () => Promise<void>;
  openCreateTask: () => void;
  openEditTask: (task: Task) => void;
  deleteTask: (taskId: string) => Promise<void>;
  deleteTasks: (ids: string[]) => Promise<void>;
}

const TaskManagementContext = createContext<TaskContextValue | null>(null);
const pageSize = 15;

export const useTaskManagement = () => {
  const context = useContext(TaskManagementContext);
  if (!context) {
    throw new Error("TaskManagementContext has not been initialised");
  }
  return context;
};

interface TaskWorkflowModalProps {
  open: boolean;
  mode: TaskModalMode;
  task: Task | null;
  actions: Action[];
  loadingActions: boolean;
  onClose: () => void;
  onSave: (draft: TaskDraft) => Promise<void>;
}

const DRAG_DATA_KEY = "application/x-task-action";

const TaskWorkflowModal: React.FC<TaskWorkflowModalProps> = ({
  open,
  mode,
  task,
  actions,
  loadingActions,
  onClose,
  onSave
}) => {
  const [name, setName] = useState("");
  const [workflow, setWorkflow] = useState<string[]>([]);
  const [actionFilter, setActionFilter] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [fullScreen, setFullScreen] = useState(false);

  useEffect(() => {
    if (open) {
      setName(task?.name ?? "");
      setWorkflow(task?.actionIds ?? []);
      setActionFilter("");
      setError(null);
      setSaving(false);
      setIsDraggingOver(false);
      setFullScreen(false);
    }
  }, [open, task]);

  const actionMap = useMemo(() => {
    const map = new Map<string, Action>();
    actions.forEach((item) => {
      map.set(item.id, item);
    });
    return map;
  }, [actions]);

  const filteredActions = useMemo(() => {
    if (!actionFilter.trim()) {
      return actions;
    }
    const lower = actionFilter.trim().toLowerCase();
    return actions.filter((item) => item.name.toLowerCase().includes(lower));
  }, [actions, actionFilter]);

  const handleLibraryDragStart = useCallback(
    (actionId: string) => (event: React.DragEvent<HTMLDivElement>) => {
      event.dataTransfer.setData(DRAG_DATA_KEY, JSON.stringify({ source: "library", actionId }));
      event.dataTransfer.effectAllowed = "copy";
    },
    []
  );

  const handleCanvasDragOver = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
    setIsDraggingOver(true);
  }, []);

  const handleCanvasDragLeave = useCallback(() => {
    setIsDraggingOver(false);
  }, []);

  const handleCanvasDrop = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      setIsDraggingOver(false);
      const raw = event.dataTransfer.getData(DRAG_DATA_KEY);
      if (!raw) {
        return;
      }
      try {
        const payload = JSON.parse(raw) as { source: string; actionId?: string };
        if (payload.source === "library" && payload.actionId) {
          const action = actions.find((item) => item.id === payload.actionId);
          if (action) {
            setWorkflow((prev) => [...prev, action.id]);
          }
        }
      } catch (error) {
        console.warn("Failed to parse drag payload", error);
      }
    },
    [actions]
  );

  const handleAddAction = useCallback(
    (action: Action) => {
      setWorkflow((prev) => [...prev, action.id]);
    },
    []
  );

  const handleRemove = useCallback((index: number) => {
    setWorkflow((prev) => prev.filter((_, idx) => idx !== index));
  }, []);

  const handleMove = useCallback((index: number, direction: -1 | 1) => {
    setWorkflow((prev) => {
      const target = index + direction;
      if (target < 0 || target >= prev.length) {
        return prev;
      }
      const next = [...prev];
      const [item] = next.splice(index, 1);
      next.splice(target, 0, item);
      return next;
    });
  }, []);

  const handleSave = async () => {
    if (!name.trim()) {
      setError("任务名称不能为空");
      return;
    }
    if (workflow.length === 0) {
      setError("请至少选择一个动作来构建流程");
      return;
    }
    setError(null);
    setSaving(true);
    try {
      await onSave({
        id: task?.id,
        name: name.trim(),
        actionIds: workflow
      });
      onClose();
    } catch (err) {
      setError((err as Error).message ?? "保存任务失败，请稍后再试");
    } finally {
      setSaving(false);
    }
  };

  const modalClassName = useMemo(
    () => (fullScreen ? "modal-card task-modal task-modal--fullscreen" : "modal-card task-modal"),
    [fullScreen]
  );

  const toggleFullScreen = useCallback(() => {
    setFullScreen((prev) => !prev);
  }, []);

  const handleCancel = useCallback(() => {
    setFullScreen(false);
    onClose();
  }, [onClose]);

  if (!open) {
    return null;
  }

  return (
    <div className="modal-backdrop">
      <div
        className={modalClassName}
        role="dialog"
        aria-modal="true"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="modal-card__header">
          <h2 className="modal-card__title">
            {mode === "edit" ? "编辑任务" : "新建任务"}
          </h2>
          <div className="task-modal__controls">
            <button
              type="button"
              className="task-modal__icon-button"
              onClick={toggleFullScreen}
              aria-label={fullScreen ? "退出全屏" : "进入全屏"}
            >
              {fullScreen ? <FiMinimize2 /> : <FiMaximize2 />}
            </button>
          </div>
        </div>
        <div className="modal-card__content task-modal__content">
          <div className="field-group">
            <label className="field-label" htmlFor="task-name">
              任务名称
            </label>
            <input
              id="task-name"
              className="field-input"
              value={name}
              onChange={(event) => setName(event.target.value)}
               placeholder="请输入任务名称"
              disabled={saving}
            />
          </div>
          <div className="task-workflow-wrapper">
            <div className="task-actions-library">
              <div className="task-actions-library__header">
                <h3>可用动作</h3>
                <div className="task-actions-library__search">
                  <FiSearch aria-hidden="true" />
                  <input
                    value={actionFilter}
                    onChange={(event) => setActionFilter(event.target.value)}
                     placeholder="按名称筛选"
                  />
                </div>
              </div>
              <div className="task-actions-library__list">
                {loadingActions ? (
                  <div className="task-actions-library__empty">正在加载动作...</div>
                ) : filteredActions.length === 0 ? (
                  <div className="task-actions-library__empty">暂无动作</div>
                ) : (
                  filteredActions.map((action) => (
                    <div
                      key={action.id}
                      className="task-actions-library__item"
                      draggable
                      onDragStart={handleLibraryDragStart(action.id)}
                      onDoubleClick={() => handleAddAction(action)}
                      title="拖拽或双击添加"
                    >
                      <span>{action.name}</span>
                    </div>
                  ))
                )}
              </div>
            </div>
            <div
              className={
                isDraggingOver
                  ? "task-workflow-canvas task-workflow-canvas--dragging"
                  : "task-workflow-canvas"
              }
              onDragOver={handleCanvasDragOver}
              onDragLeave={handleCanvasDragLeave}
              onDrop={handleCanvasDrop}
            >
              <div className="task-workflow-canvas__header">
                 <h3>任务流程</h3>
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => setWorkflow([])}
                  disabled={workflow.length === 0}
                >
                   清空
                </button>
              </div>
              <div className="task-workflow-canvas__scroll">
                {workflow.length === 0 ? (
                  <div className="task-workflow-placeholder">从左侧拖入动作以构建任务</div>
                ) : (
                  <div className="task-workflow-sequence">
                    {workflow.map((actionId, index) => {
                      const action = actionMap.get(actionId);
                      const displayName = action ? action.name : `未找到动作 (${actionId})`;
                      return (
                        <div key={`${actionId}-${index}`} className="task-workflow-sequence__item">
                          <div className="task-workflow-node">
                            <div className="task-workflow-node__name">{displayName}</div>
                            <div className="task-workflow-node__controls">
                              <button
                                type="button"
                                className="task-workflow-node__control"
                                onClick={() => handleMove(index, -1)}
                                disabled={index === 0}
                                aria-label="上移"
                              >
                                <FiArrowUp />
                              </button>
                              <button
                                type="button"
                                className="task-workflow-node__control"
                                onClick={() => handleMove(index, 1)}
                                disabled={index === workflow.length - 1}
                                aria-label="下移"
                              >
                                <FiArrowDown />
                              </button>
                              <button
                                type="button"
                                className="task-workflow-node__control task-workflow-node__control--danger"
                                onClick={() => handleRemove(index)}
                                aria-label="移除"
                              >
                                <FiX />
                              </button>
                            </div>
                          </div>
                          {index < workflow.length - 1 ? (
                            <FiArrowRight className="task-workflow-arrow" aria-hidden="true" />
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
          {error ? <div className="task-modal-error">{error}</div> : null}
        </div>
        <div className="modal-card__footer">
          <button className="secondary-button" onClick={handleCancel} disabled={saving}>
            取消
          </button>
          <button className="primary-button" onClick={handleSave} disabled={saving}>
            {saving ? "保存中..." : "保存"}
          </button>
        </div>
      </div>
    </div>
  );
};

export const TaskManagementProvider: React.FC<TaskManagementProviderProps> = ({
  projectId,
  onTotalChange,
  children
}) => {
  const api = window.api ?? null;
  const [tasks, setTasks] = useState<Task[]>([]);
  const [actions, setActions] = useState<Action[]>([]);
  const [loadingTasks, setLoadingTasks] = useState(false);
  const [loadingActions, setLoadingActions] = useState(false);
  const [modalState, setModalState] = useState<ModalState>({
    open: false,
    mode: "create",
    task: null
  });

  const fetchTasks = useCallback(async () => {
    if (!api) {
      return;
    }
    setLoadingTasks(true);
    try {
      const list = await api.getTasks(projectId);
      setTasks(list);
      onTotalChange?.(list.length);
    } catch (err) {
      console.error("Failed to load tasks", err);
    } finally {
      setLoadingTasks(false);
    }
  }, [api, projectId, onTotalChange]);

  const fetchActions = useCallback(async () => {
    if (!api) {
      return;
    }
    setLoadingActions(true);
    try {
      const list = await api.getActions(projectId);
      setActions(list);
    } catch (err) {
      console.error("Failed to load actions", err);
    } finally {
      setLoadingActions(false);
    }
  }, [api, projectId]);

  useEffect(() => {
    void fetchTasks();
    void fetchActions();
  }, [fetchTasks, fetchActions]);

  const saveTask = useCallback(
    async (draft: TaskDraft) => {
      if (!api) {
        throw new Error("系统桥接尚未准备好，无法保存任务");
      }
      const payload = {
        id: draft.id,
        name: draft.name,
        actionIds: draft.actionIds
      };
      if (draft.id) {
        await api.updateTask(projectId, draft.id, payload);
      } else {
        await api.createTask(projectId, payload);
      }
      await fetchTasks();
    },
    [api, projectId, fetchTasks]
  );

  const deleteTask = useCallback(
    async (taskId: string) => {
      if (!api) {
        return;
      }
      await api.deleteTask(projectId, taskId);
      await fetchTasks();
    },
    [api, projectId, fetchTasks]
  );

  const deleteTasks = useCallback(
    async (ids: string[]) => {
      if (!api || ids.length === 0) {
        return;
      }
      await api.deleteTasks(projectId, ids);
      await fetchTasks();
    },
    [api, projectId, fetchTasks]
  );

  const openCreateTask = useCallback(() => {
    setModalState({ open: true, mode: "create", task: null });
  }, []);

  const openEditTask = useCallback((task: Task) => {
    setModalState({ open: true, mode: "edit", task });
  }, []);

  const closeModal = useCallback(() => {
    setModalState({ open: false, mode: "create", task: null });
  }, []);

  const value = useMemo<TaskContextValue>(
    () => ({
      tasks,
      actions,
      loadingTasks,
      loadingActions,
      refreshTasks: fetchTasks,
      refreshActions: fetchActions,
      openCreateTask,
      openEditTask,
      deleteTask,
      deleteTasks
    }),
    [
      tasks,
      actions,
      loadingTasks,
      loadingActions,
      fetchTasks,
      fetchActions,
      openCreateTask,
      openEditTask,
      deleteTask,
      deleteTasks
    ]
  );

  return (
    <TaskManagementContext.Provider value={value}>
      {children}
      <TaskWorkflowModal
        open={modalState.open}
        mode={modalState.mode}
        task={modalState.task}
        actions={actions}
        loadingActions={loadingActions}
        onClose={closeModal}
        onSave={saveTask}
      />
    </TaskManagementContext.Provider>
  );
};

export const TaskManagementMain: React.FC = () => {
  const {
    tasks,
    actions,
    loadingTasks,
    openCreateTask,
    openEditTask,
    deleteTask,
    deleteTasks
  } = useTaskManagement();
  const [searchInput, setSearchInput] = useState("");
  const [keyword, setKeyword] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [page, setPage] = useState(1);

  const actionsMap = useMemo(() => {
    const map = new Map<string, Action>();
    actions.forEach((item) => {
      map.set(item.id, item);
    });
    return map;
  }, [actions]);

  useEffect(() => {
    setSelectedIds([]);
  }, [tasks]);

  const filteredTasks = useMemo(() => {
    if (!keyword.trim()) {
      return tasks;
    }
    const lower = keyword.trim().toLowerCase();
    return tasks.filter((item) => item.name.toLowerCase().includes(lower));
  }, [tasks, keyword]);

  const totalPages = Math.max(1, Math.ceil(filteredTasks.length / pageSize));

  useEffect(() => {
    if (page > totalPages) {
      setPage(totalPages);
    }
  }, [page, totalPages]);

  const begin = (page - 1) * pageSize;
  const currentItems = filteredTasks.slice(begin, begin + pageSize);
  const allChecked =
    currentItems.length > 0 && currentItems.every((item) => selectedIds.includes(item.id));

  const toggleSelectAll = (checked: boolean) => {
    if (checked) {
      const ids = currentItems.map((item) => item.id);
      setSelectedIds((prev) => Array.from(new Set([...prev, ...ids])));
    } else {
      const ids = currentItems.map((item) => item.id);
      setSelectedIds((prev) => prev.filter((item) => !ids.includes(item)));
    }
  };

  const toggleSelect = (id: string, checked: boolean) => {
    setSelectedIds((prev) => {
      if (checked) {
        return Array.from(new Set([...prev, id]));
      }
      return prev.filter((item) => item !== id);
    });
  };

  const handleQuery = () => {
    setKeyword(searchInput);
    setPage(1);
  };

  const handleReset = () => {
    setSearchInput("");
    setKeyword("");
    setPage(1);
  };

  const handleSingleDelete = async (taskId: string, taskName: string) => {
    const confirmed = window.confirm(`确定删除任务“${taskName}”吗？该操作无法撤销。`);
    if (!confirmed) {
      return;
    }
    await deleteTask(taskId);
  };

  const handleBatchDelete = async () => {
    if (selectedIds.length === 0) {
      window.alert("请先选择要删除的任务");
      return;
    }
    const confirmed = window.confirm(
      `确定删除选中的 ${selectedIds.length} 个任务吗？该操作无法撤销。`
    );
    if (!confirmed) {
      return;
    }
    await deleteTasks(selectedIds);
    setSelectedIds([]);
  };

  return (
    <div className="task-shell">
      <header className="task-header">
        <div className="task-search">
          <FiSearch aria-hidden="true" />
          <input
            className="task-search__input"
            placeholder="搜索任务"
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
          />
        </div>
        <div className="task-header-actions">
          <button className="secondary-button" onClick={handleQuery} disabled={loadingTasks}>
            查询
          </button>
          <button className="secondary-button" onClick={handleReset} disabled={loadingTasks}>
            重置
          </button>
          <button
            className="danger-button"
            onClick={handleBatchDelete}
            disabled={selectedIds.length === 0}
          >
            <FiTrash />
            删除所选
          </button>
          <button className="primary-button" onClick={openCreateTask}>
            新建任务
          </button>
        </div>
      </header>
      <section className="task-body">
        <div className="task-table-wrapper">
          <table className="task-table">
            <thead>
              <tr>
                <th style={{ width: "60px" }}>
                  <label className="task-checkbox" aria-label="选择当前页全部任务">
                    <input
                      type="checkbox"
                      checked={allChecked}
                      onChange={(event) => toggleSelectAll(event.target.checked)}
                    />
                    <span className="task-checkbox__indicator" />
                  </label>
                </th>
                <th style={{ width: "80px" }}>#</th>
                <th>名称</th>
                <th>动作</th>
                <th style={{ width: "160px" }}>操作</th>
              </tr>
            </thead>
            <tbody>
              {loadingTasks ? (
                <tr>
                  <td colSpan={5} className="task-table__status">
                    正在加载任务...
                  </td>
                </tr>
              ) : currentItems.length === 0 ? (
                <tr>
                  <td colSpan={5} className="task-table__status">
                    {keyword ? "未找到匹配的任务" : "暂无任务"}
                  </td>
                </tr>
              ) : (
                currentItems.map((item, index) => (
                  <tr key={item.id}>
                    <td>
                      <label className="task-checkbox" aria-label={`选择任务 ${item.name}`}>
                        <input
                          type="checkbox"
                          checked={selectedIds.includes(item.id)}
                          onChange={(event) => toggleSelect(item.id, event.target.checked)}
                        />
                        <span className="task-checkbox__indicator" />
                      </label>
                    </td>
                    <td>{begin + index + 1}</td>
                    <td>{item.name}</td>
                    <td>
                      {item.actionIds.length === 0
                        ? "-"
                        : item.actionIds
                            .map((actionId) => actionsMap.get(actionId)?.name ?? `(${actionId})`)
                            .join(", ")}
                    </td>
                    <td>
                      <div className="task-table__actions">
                        <button
                          type="button"
                          className="task-action-button"
                          onClick={() => openEditTask(item)}
                          title="编辑任务"
                        >
                          <FiEdit2 />
                        </button>
                        <button
                          type="button"
                          className="task-action-button task-action-button--danger"
                          onClick={() => void handleSingleDelete(item.id, item.name)}
                          title="删除任务"
                        >
                          <FiTrash2 />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <div className="task-pagination">
          <span>
            共 {filteredTasks.length} 条记录，每页 {pageSize} 条
          </span>
          <div className="task-pagination__controls">
            <button
              className="secondary-button"
              disabled={page <= 1}
              onClick={() => setPage((prev) => Math.max(1, prev - 1))}
            >
              上一页
            </button>
            <span className="task-pagination__info">
              第 {page} / {totalPages} 页
            </span>
            <button
              className="secondary-button"
              disabled={page >= totalPages}
              onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
            >
              下一页
            </button>
          </div>
        </div>
      </section>
    </div>
  );
};
