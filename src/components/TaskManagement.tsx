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
  FiArrowDown
} from "react-icons/fi";
import type { Action, Task, TaskActionNode } from "../shared/types";

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
  actions: TaskActionNode[];
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

const cloneActionContent = (content: unknown) => {
  try {
    return JSON.parse(JSON.stringify(content ?? {}));
  } catch {
    return {};
  }
};

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
  const [workflow, setWorkflow] = useState<TaskActionNode[]>([]);
  const [actionFilter, setActionFilter] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isDraggingOver, setIsDraggingOver] = useState(false);

  useEffect(() => {
    if (open) {
      setName(task?.name ?? "");
      setWorkflow(task?.actions ?? []);
      setActionFilter("");
      setError(null);
      setSaving(false);
      setIsDraggingOver(false);
    }
  }, [open, task]);

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
            const clonedContent = cloneActionContent(action.content);
            setWorkflow((prev) => [
              ...prev,
              {
                id: action.id,
                name: action.name,
                content: clonedContent
              }
            ]);
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
      const clonedContent = cloneActionContent(action.content);
      setWorkflow((prev) => [
        ...prev,
        {
          id: action.id,
          name: action.name,
          content: clonedContent
        }
      ]);
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
      setError("Task name cannot be empty");
      return;
    }
    if (workflow.length === 0) {
      setError("Select at least one Action to build the workflow");
      return;
    }
    setError(null);
    setSaving(true);
    try {
      await onSave({
        id: task?.id,
        name: name.trim(),
        actions: workflow
      });
      onClose();
    } catch (err) {
      setError((err as Error).message ?? "Failed to save task, please try again later");
    } finally {
      setSaving(false);
    }
  };

  if (!open) {
    return null;
  }

  return (
    <div className="modal-backdrop">
      <div
        className="modal-card task-modal"
        role="dialog"
        aria-modal="true"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="modal-card__header">
          <h2 className="modal-card__title">
            {mode === "edit" ? "Edit Task" : "New Task"}
          </h2>
        </div>
        <div className="modal-card__content task-modal__content">
          <div className="field-group">
            <label className="field-label" htmlFor="task-name">
              Task Name
            </label>
            <input
              id="task-name"
              className="field-input"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Enter a task name"
              disabled={saving}
            />
          </div>
          <div className="task-workflow-wrapper">
            <div className="task-actions-library">
              <div className="task-actions-library__header">
                <h3>Available Actions</h3>
                <div className="task-actions-library__search">
                  <FiSearch aria-hidden="true" />
                  <input
                    value={actionFilter}
                    onChange={(event) => setActionFilter(event.target.value)}
                    placeholder="Filter actions"
                  />
                </div>
              </div>
              <div className="task-actions-library__list">
                {loadingActions ? (
                  <div className="task-actions-library__empty">Loading actions...</div>
                ) : filteredActions.length === 0 ? (
                  <div className="task-actions-library__empty">No actions available</div>
                ) : (
                  filteredActions.map((action) => (
                    <div
                      key={action.id}
                      className="task-actions-library__item"
                      draggable
                      onDragStart={handleLibraryDragStart(action.id)}
                      onDoubleClick={() => handleAddAction(action)}
                    >
                      <span>{action.name}</span>
                      <span className="task-actions-library__hint">Drag or double-click to add</span>
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
                <h3>Workflow</h3>
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => setWorkflow([])}
                  disabled={workflow.length === 0}
                >
                  Clear
                </button>
              </div>
              {workflow.length === 0 ? (
                <div className="task-workflow-placeholder">
                  Drag actions from the left to build this task
                </div>
              ) : (
                <div className="task-workflow-sequence">
                  {workflow.map((node, index) => (
                    <div key={`${node.id}-${index}`} className="task-workflow-sequence__item">
                      <div className="task-workflow-node">
                        <div className="task-workflow-node__name">{node.name}</div>
                        <div className="task-workflow-node__controls">
                          <button
                            type="button"
                            className="task-workflow-node__control"
                            onClick={() => handleMove(index, -1)}
                            disabled={index === 0}
                            aria-label="Move up"
                          >
                            <FiArrowUp />
                          </button>
                          <button
                            type="button"
                            className="task-workflow-node__control"
                            onClick={() => handleMove(index, 1)}
                            disabled={index === workflow.length - 1}
                            aria-label="Move down"
                          >
                            <FiArrowDown />
                          </button>
                          <button
                            type="button"
                            className="task-workflow-node__control task-workflow-node__control--danger"
                            onClick={() => handleRemove(index)}
                            aria-label="Remove"
                          >
                            <FiX />
                          </button>
                        </div>
                      </div>
                      {index < workflow.length - 1 ? (
                        <FiArrowRight className="task-workflow-arrow" aria-hidden="true" />
                      ) : null}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
          {error ? <div className="task-modal-error">{error}</div> : null}
        </div>
        <div className="modal-card__footer">
          <button className="secondary-button" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button className="primary-button" onClick={handleSave} disabled={saving}>
            {saving ? "Saving..." : "Save"}
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
        throw new Error("System bridge is not ready, unable to save task");
      }
      const payload = {
        id: draft.id,
        name: draft.name,
        actions: draft.actions
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
    const confirmed = window.confirm(`Delete task "${taskName}"? This action cannot be undone.`);
    if (!confirmed) {
      return;
    }
    await deleteTask(taskId);
  };

  const handleBatchDelete = async () => {
    if (selectedIds.length === 0) {
      window.alert("Select at least one task to delete");
      return;
    }
    const confirmed = window.confirm(
      `Delete ${selectedIds.length} tasks? This action cannot be undone.`
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
            placeholder="Search tasks"
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
          />
        </div>
        <div className="task-header-actions">
          <button className="secondary-button" onClick={handleQuery} disabled={loadingTasks}>
            Query
          </button>
          <button className="secondary-button" onClick={handleReset} disabled={loadingTasks}>
            Reset
          </button>
          <button
            className="danger-button"
            onClick={handleBatchDelete}
            disabled={selectedIds.length === 0}
          >
            <FiTrash />
            Delete Selected
          </button>
          <button className="primary-button" onClick={openCreateTask}>
            New Task
          </button>
        </div>
      </header>
      <section className="task-body">
        <div className="task-table-wrapper">
          <table className="task-table">
            <thead>
              <tr>
                <th style={{ width: "60px" }}>
                  <label className="task-checkbox" aria-label="Select all tasks on current page">
                    <input
                      type="checkbox"
                      checked={allChecked}
                      onChange={(event) => toggleSelectAll(event.target.checked)}
                    />
                    <span className="task-checkbox__indicator" />
                  </label>
                </th>
                <th style={{ width: "80px" }}>#</th>
                <th>Name</th>
                <th>Actions</th>
                <th style={{ width: "160px" }}>Operations</th>
              </tr>
            </thead>
            <tbody>
              {loadingTasks ? (
                <tr>
                  <td colSpan={5} className="task-table__status">
                    Loading tasks...
                  </td>
                </tr>
              ) : currentItems.length === 0 ? (
                <tr>
                  <td colSpan={5} className="task-table__status">
                    {keyword ? "No matching tasks found" : "No tasks available"}
                  </td>
                </tr>
              ) : (
                currentItems.map((item, index) => (
                  <tr key={item.id}>
                    <td>
                      <label className="task-checkbox" aria-label={`Select task ${item.name}`}>
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
                      {item.actions.length === 0
                        ? "-"
                        : item.actions.map((action) => action.name).join(", ")}
                    </td>
                    <td>
                      <div className="task-table__actions">
                        <button
                          type="button"
                          className="task-action-button"
                          onClick={() => openEditTask(item)}
                          title="Edit task"
                        >
                          <FiEdit2 />
                        </button>
                        <button
                          type="button"
                          className="task-action-button task-action-button--danger"
                          onClick={() => void handleSingleDelete(item.id, item.name)}
                          title="Delete task"
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
            Total {filteredTasks.length} records, {pageSize} per page
          </span>
          <div className="task-pagination__controls">
            <button
              className="secondary-button"
              disabled={page <= 1}
              onClick={() => setPage((prev) => Math.max(1, prev - 1))}
            >
              Previous
            </button>
            <span className="task-pagination__info">
              Page {page} / {totalPages}
            </span>
            <button
              className="secondary-button"
              disabled={page >= totalPages}
              onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
            >
              Next
            </button>
          </div>
        </div>
      </section>
    </div>
  );
};
