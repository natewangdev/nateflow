import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";
import {
  FiEdit2,
  FiTrash,
  FiTrash2,
  FiSearch,
  FiArrowUp,
  FiArrowDown,
  FiPlus,
  FiRepeat,
  FiEye
} from "react-icons/fi";
import type { Plan, PlanPayload, PlanTaskRef, Task, PlanPreview } from "../shared/types";

interface PlanManagementProviderProps {
  projectId: string;
  onTotalChange?: (total: number) => void;
  children: React.ReactNode;
}

type PlanModalMode = "create" | "edit";

interface ModalState {
  open: boolean;
  mode: PlanModalMode;
  plan: Plan | null;
}

interface PlanDraft extends PlanPayload {
  id?: string;
}

interface PlanContextValue {
  plans: Plan[];
  tasks: Task[];
  loadingPlans: boolean;
  loadingTasks: boolean;
  openCreatePlan: () => void;
  openEditPlan: (plan: Plan) => void;
  deletePlan: (id: string) => Promise<void>;
  deletePlans: (ids: string[]) => Promise<void>;
  refreshPlans: () => Promise<void>;
  previewPlan: (id: string) => Promise<PlanPreview>;
}

const PlanManagementContext = createContext<PlanContextValue | null>(null);
const pageSize = 15;

const DEFAULT_REPEAT: PlanTaskRef["repeat"] = [1, 1];

const isInfiniteRepeat = (repeat: PlanTaskRef["repeat"]) => repeat[0] === 0 && repeat[1] === 0;

const formatRepeat = (repeat: PlanTaskRef["repeat"]) => {
  if (isInfiniteRepeat(repeat)) {
    return "∞";
  }
  const [min, max] = repeat;
  return min === max ? `${min}` : `${min}-${max}`;
};

interface PlanWorkflowModalProps {
  open: boolean;
  mode: PlanModalMode;
  plan: Plan | null;
  tasks: Task[];
  loadingTasks: boolean;
  onClose: () => void;
  onSave: (draft: PlanDraft) => Promise<void>;
}

interface PlanStepState {
  taskId: string;
  repeat: PlanTaskRef["repeat"];
}

interface PlanPreviewState {
  open: boolean;
  loading: boolean;
  planName?: string;
  data?: PlanPreview;
  error?: string;
}

const normalizeSteps = (steps: PlanStepState[]): PlanStepState[] => {
  if (steps.length <= 1) {
    return steps;
  }
  return steps.map((step, index) => {
    if (isInfiniteRepeat(step.repeat) && index !== steps.length - 1) {
      return { ...step, repeat: DEFAULT_REPEAT };
    }
    return step;
  });
};

const PlanWorkflowModal: React.FC<PlanWorkflowModalProps> = ({
  open,
  mode,
  plan,
  tasks,
  loadingTasks,
  onClose,
  onSave
}) => {
  const [name, setName] = useState("");
  const [steps, setSteps] = useState<PlanStepState[]>([]);
  const [taskFilter, setTaskFilter] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setName(plan?.name ?? "");
      setSteps(
        plan?.tasks.map((item) => ({
          taskId: item.id,
          repeat: [...item.repeat] as PlanTaskRef["repeat"]
        })) ?? []
      );
      setTaskFilter("");
      setSaving(false);
      setError(null);
    }
  }, [open, plan]);

  const taskMap = useMemo(() => {
    const map = new Map<string, Task>();
    tasks.forEach((task) => {
      map.set(task.id, task);
    });
    return map;
  }, [tasks]);

  const filteredTasks = useMemo(() => {
    if (!taskFilter.trim()) {
      return tasks;
    }
    const lower = taskFilter.trim().toLowerCase();
    return tasks.filter((task) => task.name.toLowerCase().includes(lower));
  }, [tasks, taskFilter]);

  const addStep = useCallback(
    (task: Task) => {
      setSteps((prev) => normalizeSteps([...prev, { taskId: task.id, repeat: DEFAULT_REPEAT }]));
    },
    []
  );

  const removeStep = useCallback((index: number) => {
    setSteps((prev) => prev.filter((_, idx) => idx !== index));
  }, []);

  const moveStep = useCallback((index: number, direction: -1 | 1) => {
    setSteps((prev) => {
      const target = index + direction;
      if (target < 0 || target >= prev.length) {
        return prev;
      }
      const next = [...prev];
      const [item] = next.splice(index, 1);
      next.splice(target, 0, item);
      return normalizeSteps(next);
    });
  }, []);

  const updateStepTask = useCallback((index: number, taskId: string) => {
    setSteps((prev) =>
      prev.map((item, idx) => (idx === index ? { ...item, taskId } : item))
    );
  }, []);

  const updateStepRepeat = useCallback(
    (index: number, repeat: PlanTaskRef["repeat"]) => {
      setSteps((prev) =>
        prev.map((item, idx) => (idx === index ? { ...item, repeat } : item))
      );
    },
    []
  );

  const toggleInfinite = useCallback(
    (index: number) => {
      setSteps((prev) => {
        if (prev.length === 0) {
          return prev;
        }
        const isLast = index === prev.length - 1;
        const isSingle = prev.length === 1;
        if (!isLast && !isSingle) {
          window.alert("只有最后一个任务或唯一的任务才能设置为无限循环");
          return prev;
        }
        return prev.map((item, idx) =>
          idx === index
            ? {
                ...item,
                repeat: isInfiniteRepeat(item.repeat) ? DEFAULT_REPEAT : [0, 0]
              }
            : item
        );
      });
    },
    []
  );

  const handleSave = useCallback(async () => {
    if (!name.trim()) {
      setError("Plan 名称不能为空");
      return;
    }
    if (steps.length === 0) {
      setError("请至少选择一个任务");
      return;
    }
    if (steps.some((step) => !step.taskId)) {
      setError("任务选择不能为空");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSave({
        id: plan?.id,
        name: name.trim(),
        tasks: steps.map((step, index) => {
          const sanitized = isInfiniteRepeat(step.repeat)
            ? ([0, 0] as PlanTaskRef["repeat"])
            : ([
                Math.max(1, Math.floor(step.repeat[0])),
                Math.max(Math.max(1, Math.floor(step.repeat[0])), Math.floor(step.repeat[1]))
              ] as PlanTaskRef["repeat"]);
          if (isInfiniteRepeat(sanitized)) {
            const isLast = index === steps.length - 1;
            if (!isLast && steps.length > 1) {
              throw new Error("只有最后一个任务或唯一的任务可以设置为无限循环");
            }
          }
          return {
            id: step.taskId,
            repeat: sanitized
          };
        })
      });
      onClose();
    } catch (err) {
      setError((err as Error).message ?? "保存 Plan 失败，请稍后再试");
    } finally {
      setSaving(false);
    }
  }, [name, steps, onSave, onClose, plan?.id]);

  if (!open) {
    return null;
  }

  const canAddTask = tasks.length > 0;

  return (
    <div className="modal-backdrop">
      <div
        className="modal-card plan-modal"
        role="dialog"
        aria-modal="true"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="modal-card__header">
          <h2 className="modal-card__title">{mode === "edit" ? "编辑 Plan" : "新建 Plan"}</h2>
        </div>
        <div className="modal-card__content plan-modal__content">
          <div className="field-group">
            <label className="field-label" htmlFor="plan-name">
              Plan 名称
            </label>
            <input
              id="plan-name"
              className="field-input"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="请输入 Plan 名称"
              disabled={saving}
            />
          </div>
          <div className="plan-workflow-wrapper">
            <div className="plan-tasks-library">
              <div className="plan-tasks-library__header">
                <h3>可用任务</h3>
                <div className="plan-tasks-library__search">
                  <FiSearch aria-hidden="true" />
                  <input
                    value={taskFilter}
                    onChange={(event) => setTaskFilter(event.target.value)}
                    placeholder="按名称筛选"
                  />
                </div>
              </div>
              <div className="plan-tasks-library__list">
                {loadingTasks ? (
                  <div className="plan-tasks-library__empty">正在加载任务...</div>
                ) : filteredTasks.length === 0 ? (
                  <div className="plan-tasks-library__empty">暂无符合条件的任务</div>
                ) : (
                  filteredTasks.map((task) => (
                    <button
                      key={task.id}
                      type="button"
                      className="plan-tasks-library__item"
                      onClick={() => addStep(task)}
                      disabled={!canAddTask}
                      title="点击添加至 Plan"
                    >
                      <span className="plan-tasks-library__name">{task.name}</span>
                      <FiPlus />
                    </button>
                  ))
                )}
              </div>
            </div>
            <div className="plan-steps">
              <div className="plan-steps__header">
                <h3>Plan 任务序列</h3>
                <span className="plan-steps__hint">
                  点击左侧任务或使用下方按钮增加步骤。
                </span>
              </div>
              <div className="plan-steps__body">
                {steps.length === 0 ? (
                  <div className="plan-steps__placeholder">
                    从左侧选择任务添加到 Plan 中。
                  </div>
                ) : (
                  steps.map((step, index) => {
                    const availableTasks = tasks;
                    const isLast = index === steps.length - 1;
                    const infiniteEnabled = isInfiniteRepeat(step.repeat);
                    const taskName =
                      taskMap.get(step.taskId)?.name ?? `未找到任务 (${step.taskId})`;
                    return (
                      <div key={`${step.taskId}-${index}`} className="plan-step-card">
                        <div className="plan-step-card__main">
                          <div className="plan-step-card__title">
                            <span className="plan-step-card__index">{index + 1}</span>
                            <select
                              value={step.taskId}
                              onChange={(event) =>
                                updateStepTask(index, event.target.value)
                              }
                            >
                              {availableTasks.map((task) => (
                                <option key={task.id} value={task.id}>
                                  {task.name}
                                </option>
                              ))}
                              {taskMap.has(step.taskId) ? null : (
                                <option value={step.taskId}>{taskName}</option>
                              )}
                            </select>
                          </div>
                          <div className="plan-step-card__repeat">
                            <label>
                              最小次数
                              <input
                                type="number"
                                min={1}
                                value={infiniteEnabled ? "" : step.repeat[0]}
                                onChange={(event) =>
                                  updateStepRepeat(index, [
                                    Math.max(1, Number.parseInt(event.target.value, 10) || 1),
                                    step.repeat[1]
                                  ])
                                }
                                disabled={infiniteEnabled}
                              />
                            </label>
                            <label>
                              最大次数
                              <input
                                type="number"
                                min={1}
                                value={infiniteEnabled ? "" : step.repeat[1]}
                                onChange={(event) =>
                                  updateStepRepeat(index, [
                                    step.repeat[0],
                                    Math.max(
                                      step.repeat[0],
                                      Number.parseInt(event.target.value, 10) || step.repeat[0]
                                    )
                                  ])
                                }
                                disabled={infiniteEnabled}
                              />
                            </label>
                            <button
                              type="button"
                              className={
                                infiniteEnabled
                                  ? "plan-infinite-toggle plan-infinite-toggle--active"
                                  : "plan-infinite-toggle"
                              }
                              onClick={() => toggleInfinite(index)}
                              title="设置为无限循环"
                            >
                              <FiRepeat />
                              <span>{infiniteEnabled ? "无限" : "有限"}</span>
                            </button>
                            {!infiniteEnabled && (
                              <span className="plan-step-card__repeat-hint">
                                当前范围：{formatRepeat(step.repeat)}
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="plan-step-card__controls">
                          <button
                            type="button"
                            className="plan-step-card__control"
                            onClick={() => moveStep(index, -1)}
                            disabled={index === 0}
                            aria-label="上移"
                          >
                            <FiArrowUp />
                          </button>
                          <button
                            type="button"
                            className="plan-step-card__control"
                            onClick={() => moveStep(index, 1)}
                            disabled={index === steps.length - 1}
                            aria-label="下移"
                          >
                            <FiArrowDown />
                          </button>
                          <button
                            type="button"
                            className="plan-step-card__control plan-step-card__control--danger"
                            onClick={() => removeStep(index)}
                            aria-label="移除"
                          >
                            <FiTrash />
                          </button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>
          {error ? <div className="plan-modal-error">{error}</div> : null}
        </div>
        <div className="modal-card__footer">
          <button className="secondary-button" onClick={onClose} disabled={saving}>
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

export const usePlanManagement = () => {
  const context = useContext(PlanManagementContext);
  if (!context) {
    throw new Error("PlanManagementContext 尚未初始化");
  }
  return context;
};

export const PlanManagementProvider: React.FC<PlanManagementProviderProps> = ({
  projectId,
  onTotalChange,
  children
}) => {
  const api = window.api ?? null;
  const [plans, setPlans] = useState<Plan[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loadingPlans, setLoadingPlans] = useState(false);
  const [loadingTasks, setLoadingTasks] = useState(false);
  const [modalState, setModalState] = useState<ModalState>({
    open: false,
    mode: "create",
    plan: null
  });

  const fetchPlans = useCallback(async () => {
    if (!api) {
      return;
    }
    setLoadingPlans(true);
    try {
      const list = await api.getPlans(projectId);
      setPlans(list);
      onTotalChange?.(list.length);
    } catch (error) {
      console.error("加载 Plan 列表失败", error);
    } finally {
      setLoadingPlans(false);
    }
  }, [api, projectId, onTotalChange]);

  const fetchTasks = useCallback(async () => {
    if (!api) {
      return;
    }
    setLoadingTasks(true);
    try {
      const list = await api.getTasks(projectId);
      setTasks(list);
    } catch (error) {
      console.error("加载 Task 列表失败", error);
    } finally {
      setLoadingTasks(false);
    }
  }, [api, projectId]);

  useEffect(() => {
    void fetchPlans();
    void fetchTasks();
  }, [fetchPlans, fetchTasks]);

  const openCreatePlan = useCallback(() => {
    setModalState({ open: true, mode: "create", plan: null });
  }, []);

  const openEditPlan = useCallback((plan: Plan) => {
    setModalState({ open: true, mode: "edit", plan });
  }, []);

  const closeModal = useCallback(() => {
    setModalState({ open: false, mode: "create", plan: null });
  }, []);

  const savePlan = useCallback(
    async (draft: PlanDraft) => {
      if (!api) {
        throw new Error("系统桥接尚未准备好，无法保存 Plan");
      }
      if (draft.id) {
        await api.updatePlan(projectId, draft.id, draft);
      } else {
        await api.createPlan(projectId, draft);
      }
      await fetchPlans();
    },
    [api, projectId, fetchPlans]
  );

  const deletePlan = useCallback(
    async (id: string) => {
      if (!api) {
        return;
      }
      await api.deletePlan(projectId, id);
      await fetchPlans();
    },
    [api, projectId, fetchPlans]
  );

  const deletePlans = useCallback(
    async (ids: string[]) => {
      if (!api || ids.length === 0) {
        return;
      }
      await api.deletePlans(projectId, ids);
      await fetchPlans();
    },
    [api, projectId, fetchPlans]
  );

  const previewPlan = useCallback(
    async (id: string) => {
      if (!api) {
        throw new Error("系统桥接尚未准备好，无法预览 Plan");
      }
      return api.previewPlan(projectId, id);
    },
    [api, projectId]
  );

  const value = useMemo<PlanContextValue>(
    () => ({
      plans,
      tasks,
      loadingPlans,
      loadingTasks,
      openCreatePlan,
      openEditPlan,
      deletePlan,
      deletePlans,
      refreshPlans: fetchPlans,
      previewPlan
    }),
    [
      plans,
      tasks,
      loadingPlans,
      loadingTasks,
      openCreatePlan,
      openEditPlan,
      deletePlan,
      deletePlans,
      fetchPlans,
      previewPlan
    ]
  );

  return (
    <PlanManagementContext.Provider value={value}>
      {children}
      <PlanWorkflowModal
        open={modalState.open}
        mode={modalState.mode}
        plan={modalState.plan}
        tasks={tasks}
        loadingTasks={loadingTasks}
        onClose={closeModal}
        onSave={savePlan}
      />
    </PlanManagementContext.Provider>
  );
};

export const PlanManagementMain: React.FC = () => {
  const {
    plans,
    tasks,
    loadingPlans,
    openCreatePlan,
    openEditPlan,
    deletePlan,
    deletePlans,
    previewPlan
  } = usePlanManagement();
  const [searchInput, setSearchInput] = useState("");
  const [keyword, setKeyword] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [page, setPage] = useState(1);
  const [previewState, setPreviewState] = useState<PlanPreviewState>({
    open: false,
    loading: false
  });
  const [copyHint, setCopyHint] = useState("");
  const copyHintTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const tasksMap = useMemo(() => {
    const map = new Map<string, Task>();
    tasks.forEach((task) => map.set(task.id, task));
    return map;
  }, [tasks]);

  useEffect(() => {
    if (!previewState.open) {
      if (copyHintTimer.current) {
        clearTimeout(copyHintTimer.current);
        copyHintTimer.current = null;
      }
      setCopyHint("");
    }
  }, [previewState.open]);

  useEffect(() => {
    return () => {
      if (copyHintTimer.current) {
        clearTimeout(copyHintTimer.current);
      }
    };
  }, []);

  const previewJson = useMemo(
    () => (previewState.data ? JSON.stringify(previewState.data, null, 2) : ""),
    [previewState.data]
  );

  const handlePreviewPlan = useCallback(
    async (plan: Plan) => {
      setPreviewState({ open: true, loading: true, planName: plan.name });
      try {
        const data = await previewPlan(plan.id);
        setPreviewState({
          open: true,
          loading: false,
          planName: plan.name,
          data,
          error: undefined
        });
        setCopyHint("");
      } catch (error) {
        setPreviewState({
          open: true,
          loading: false,
          planName: plan.name,
          error: (error as Error).message ?? "生成预览失败"
        });
      }
    },
    [previewPlan]
  );

  const handleClosePreview = useCallback(() => {
    if (copyHintTimer.current) {
      clearTimeout(copyHintTimer.current);
      copyHintTimer.current = null;
    }
    setCopyHint("");
    setPreviewState({ open: false, loading: false });
  }, []);

  const handleCopyPreview = useCallback(async () => {
    if (!previewState.data) {
      return;
    }
    const json = previewJson;
    try {
      await navigator.clipboard.writeText(json);
      setCopyHint("已复制");
    } catch (error) {
      setCopyHint("复制失败");
    } finally {
      if (copyHintTimer.current) {
        clearTimeout(copyHintTimer.current);
      }
      copyHintTimer.current = setTimeout(() => {
        setCopyHint("");
        copyHintTimer.current = null;
      }, 2000);
    }
  }, [previewState.data, previewJson]);

  useEffect(() => {
    setSelectedIds([]);
  }, [plans]);

  const filteredPlans = useMemo(() => {
    if (!keyword.trim()) {
      return plans;
    }
    const lower = keyword.trim().toLowerCase();
    return plans.filter((item) => item.name.toLowerCase().includes(lower));
  }, [plans, keyword]);

  const totalPages = Math.max(1, Math.ceil(filteredPlans.length / pageSize));

  useEffect(() => {
    if (page > totalPages) {
      setPage(totalPages);
    }
  }, [page, totalPages]);

  const begin = (page - 1) * pageSize;
  const currentItems = filteredPlans.slice(begin, begin + pageSize);

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

  const handleSingleDelete = async (id: string, name: string) => {
    const confirmed = window.confirm(`确定删除 Plan “${name}” 吗？该操作无法撤销。`);
    if (!confirmed) {
      return;
    }
    await deletePlan(id);
  };

  const handleBatchDelete = async () => {
    if (selectedIds.length === 0) {
      window.alert("请先选择要删除的 Plan");
      return;
    }
    const confirmed = window.confirm(
      `确定删除选中的 ${selectedIds.length} 个 Plan 吗？该操作无法撤销。`
    );
    if (!confirmed) {
      return;
    }
    await deletePlans(selectedIds);
    setSelectedIds([]);
  };

  return (
    <div className="plan-shell">
      <header className="plan-header">
        <div className="plan-search">
          <FiSearch aria-hidden="true" />
          <input
            className="plan-search__input"
            placeholder="搜索 Plan"
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
          />
        </div>
        <div className="plan-header-actions">
          <button className="secondary-button" onClick={handleQuery} disabled={loadingPlans}>
            查询
          </button>
          <button className="secondary-button" onClick={handleReset} disabled={loadingPlans}>
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
          <button className="primary-button" onClick={openCreatePlan}>
            新建 Plan
          </button>
        </div>
      </header>
      <section className="plan-body">
        <div className="plan-table-wrapper">
          <table className="plan-table">
            <thead>
              <tr>
                <th style={{ width: "60px" }}>
                  <label className="plan-checkbox" aria-label="选择当前页全部 Plan">
                    <input
                      type="checkbox"
                      checked={allChecked}
                      onChange={(event) => toggleSelectAll(event.target.checked)}
                    />
                    <span className="plan-checkbox__indicator" />
                  </label>
                </th>
                <th style={{ width: "80px" }}>#</th>
                <th>名称</th>
                <th>任务序列</th>
                <th style={{ width: "160px" }}>操作</th>
              </tr>
            </thead>
            <tbody>
              {loadingPlans ? (
                <tr>
                  <td colSpan={5} className="plan-table__status">
                    正在加载 Plan...
                  </td>
                </tr>
              ) : currentItems.length === 0 ? (
                <tr>
                  <td colSpan={5} className="plan-table__status">
                    {keyword ? "未找到匹配的 Plan" : "暂无 Plan"}
                  </td>
                </tr>
              ) : (
                currentItems.map((item, index) => (
                  <tr key={item.id}>
                    <td>
                      <label className="plan-checkbox" aria-label={`选择 Plan ${item.name}`}>
                        <input
                          type="checkbox"
                          checked={selectedIds.includes(item.id)}
                          onChange={(event) => toggleSelect(item.id, event.target.checked)}
                        />
                        <span className="plan-checkbox__indicator" />
                      </label>
                    </td>
                    <td>{begin + index + 1}</td>
                    <td>{item.name}</td>
                    <td>
                      {item.tasks.length === 0
                        ? "-"
                        : item.tasks
                            .map((step) => {
                              const task = tasksMap.get(step.id);
                              const repeatText = formatRepeat(step.repeat);
                              return `${task ? task.name : `(${step.id})`} x${repeatText}`;
                            })
                            .join(" → ")}
                    </td>
                    <td>
                      <div className="plan-table__actions">
                        <button
                          type="button"
                          className="plan-action-button"
                          onClick={() => void handlePreviewPlan(item)}
                          title="预览 Plan JSON"
                        >
                          <FiEye />
                        </button>
                        <button
                          type="button"
                          className="plan-action-button"
                          onClick={() => openEditPlan(item)}
                          title="编辑 Plan"
                        >
                          <FiEdit2 />
                        </button>
                        <button
                          type="button"
                          className="plan-action-button plan-action-button--danger"
                          onClick={() => void handleSingleDelete(item.id, item.name)}
                          title="删除 Plan"
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
        <div className="plan-pagination">
          <span>
            共 {filteredPlans.length} 条记录，每页 {pageSize} 条
          </span>
          <div className="plan-pagination__controls">
            <button
              className="secondary-button"
              disabled={page <= 1}
              onClick={() => setPage((prev) => Math.max(1, prev - 1))}
            >
              上一页
            </button>
            <span className="plan-pagination__info">
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
      {previewState.open ? (
        <div className="modal-backdrop" onClick={handleClosePreview}>
          <div
            className="modal-card plan-preview-modal"
            role="dialog"
            aria-modal="true"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="modal-card__header">
              <h2 className="modal-card__title">
                {previewState.planName ? `${previewState.planName} JSON 预览` : "Plan JSON 预览"}
              </h2>
            </div>
            <div className="modal-card__content plan-preview-modal__content">
              {previewState.loading ? (
                <div className="plan-preview-modal__status">正在生成预览...</div>
              ) : previewState.error ? (
                <div className="plan-preview-modal__error">{previewState.error}</div>
              ) : (
                <pre className="plan-preview-json">{previewJson}</pre>
              )}
            </div>
            <div className="modal-card__footer plan-preview-modal__footer">
              <div className="plan-preview-toolbar">
                <button
                  className="secondary-button"
                  onClick={handleCopyPreview}
                  disabled={previewState.loading || !!previewState.error || !previewState.data}
                >
                  复制 JSON
                </button>
                {copyHint ? <span className="plan-preview-copy-hint">{copyHint}</span> : null}
              </div>
              <button className="primary-button" onClick={handleClosePreview}>
                关闭
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
};

