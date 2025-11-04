import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState
} from "react";
import { FiEdit2, FiTrash, FiTrash2, FiSearch } from "react-icons/fi";
import type { Action, ActionContent, Template } from "../shared/types";

interface ActionManagementProviderProps {
  projectId: string;
  onTotalChange?: (total: number) => void;
  children: React.ReactNode;
}

type ActionModalMode = "create" | "edit";

interface ModalState {
  open: boolean;
  mode: ActionModalMode;
  template: Template | null;
  action: Action | null;
}

interface ActionDraft {
  id?: string;
  name: string;
  templateId: string;
  templateName: string;
  content: ActionContent;
}

const PAGE_SIZE = 8;

interface ActionContextValue {
  actions: Action[];
  templates: Template[];
  loadingActions: boolean;
  loadingTemplates: boolean;
  refreshActions: () => Promise<void>;
  openCreateFromTemplate: (template: Template) => void;
  openEditAction: (action: Action) => void;
  deleteAction: (actionId: string) => Promise<void>;
  deleteActions: (ids: string[]) => Promise<void>;
  closeModal: () => void;
  modal: ModalState;
  saveAction: (draft: ActionDraft) => Promise<void>;
}

const ActionManagementContext = createContext<ActionContextValue | null>(null);

export const useActionManagement = () => {
  const context = useContext(ActionManagementContext);
  if (!context) {
    throw new Error("ActionManagementContext 尚未初始化");
  }
  return context;
};

type FieldType = "readonly" | "string" | "number" | "bool" | "array-number";

interface FieldSchema {
  key: string;
  label: string;
  type: FieldType;
  readOnly: boolean;
  nullable?: boolean;
  staticValue?: unknown;
  defaultValue?: unknown;
}

interface FieldState {
  schemas: FieldSchema[];
  initialValues: Record<string, string | boolean>;
}

interface PlaceholderInfo {
  type: FieldType;
  defaultValue?: unknown;
  nullable?: boolean;
}

const parsePlaceholder = (raw: string): PlaceholderInfo => {
  const text = raw.slice(1);
  const [typePart, ...rest] = text.split("|");
  const typeToken = typePart.trim().toLowerCase();
  const defaultText = rest.join("|").trim();

  if (typeToken === "array<number>") {
    if (!defaultText || defaultText.toLowerCase() === "null") {
      return {
        type: "array-number",
        nullable: true,
        defaultValue: null
      };
    }
    try {
      const parsed = JSON.parse(defaultText);
      if (Array.isArray(parsed)) {
        return {
          type: "array-number",
          defaultValue: parsed
        };
      }
    } catch {
      const fallback = defaultText
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean)
        .map(Number)
        .filter((item) => !Number.isNaN(item));
      return {
        type: "array-number",
        defaultValue: fallback
      };
    }
    return {
      type: "array-number",
      defaultValue: []
    };
  }

  switch (typeToken) {
    case "number":
      return {
        type: "number",
        defaultValue: defaultText ? Number(defaultText) : undefined
      };
    case "string":
      return {
        type: "string",
        defaultValue: defaultText ?? ""
      };
    case "bool":
      return {
        type: "bool",
        defaultValue: defaultText ? defaultText === "true" : false
      };
    default:
      return {
        type: "string",
        defaultValue: defaultText ?? ""
      };
  }
};

const buildFieldState = (
  template: Template | null,
  existingContent: ActionContent | null
): FieldState => {
  if (!template) {
    return { schemas: [], initialValues: {} };
  }

  const schemas: FieldSchema[] = [];
  const initialValues: Record<string, string | boolean> = {};
  const contentEntries = Object.entries(template.content ?? {});

  for (const [key, rawValue] of contentEntries) {
    if (typeof rawValue === "string" && rawValue.startsWith("@")) {
      const placeholder = parsePlaceholder(rawValue);
      const schema: FieldSchema = {
        key,
        label: key,
        type: placeholder.type,
        readOnly: false,
        nullable: placeholder.nullable,
        defaultValue: placeholder.defaultValue
      };
      schemas.push(schema);
      const existingValue = existingContent?.[key];

      switch (schema.type) {
        case "number": {
          const value =
            typeof existingValue === "number"
              ? existingValue.toString()
              : schema.defaultValue !== undefined
              ? String(schema.defaultValue)
              : "";
          initialValues[key] = value;
          break;
        }
        case "string": {
          const value =
            typeof existingValue === "string"
              ? existingValue
              : schema.defaultValue !== undefined
              ? String(schema.defaultValue)
              : "";
          initialValues[key] = value;
          break;
        }
        case "bool": {
          const value =
            typeof existingValue === "boolean"
              ? existingValue
              : typeof schema.defaultValue === "boolean"
              ? schema.defaultValue
              : false;
          initialValues[key] = value;
          break;
        }
        case "array-number": {
          if (Array.isArray(existingValue)) {
            initialValues[key] = existingValue.join(",");
          } else if (typeof existingValue === "string") {
            initialValues[key] = existingValue;
          } else if (schema.defaultValue === null) {
            initialValues[key] = "";
          } else if (Array.isArray(schema.defaultValue)) {
            initialValues[key] = (schema.defaultValue as number[]).join(",");
          } else {
            initialValues[key] = "";
          }
          break;
        }
        default:
          initialValues[key] = "";
      }
    } else {
      const staticValue =
        existingContent && key in existingContent ? existingContent[key] : rawValue;
      const schema: FieldSchema = {
        key,
        label: key,
        type: "readonly",
        readOnly: true,
        staticValue
      };
      schemas.push(schema);
      initialValues[key] = String(staticValue ?? "");
    }
  }

  return { schemas, initialValues };
};

const collectFieldValues = (
  schemas: FieldSchema[],
  values: Record<string, string | boolean>
): { content: ActionContent; error?: string } => {
  const content: ActionContent = {};

  for (const schema of schemas) {
    const raw = values[schema.key];
    switch (schema.type) {
      case "readonly":
        content[schema.key] = schema.staticValue ?? raw ?? "";
        break;
      case "string":
        content[schema.key] = (raw ?? "").toString();
        break;
      case "number": {
        const text = (raw ?? "").toString().trim();
        if (!text) {
          return { content, error: `字段 ${schema.label} 不能为空` };
        }
        const parsed = Number(text);
        if (Number.isNaN(parsed)) {
          return { content, error: `字段 ${schema.label} 必须为有效的数字` };
        }
        content[schema.key] = parsed;
        break;
      }
      case "bool":
        content[schema.key] = Boolean(raw);
        break;
      case "array-number": {
        const text = (raw ?? "").toString().trim();
        if (!text) {
          if (schema.nullable) {
            content[schema.key] = null;
            break;
          }
          content[schema.key] = [];
          break;
        }
        const segments = text.split(",").map((item) => item.trim()).filter(Boolean);
        const numbers: number[] = [];
        for (const segment of segments) {
          const parsed = Number(segment);
          if (Number.isNaN(parsed)) {
            return {
              content,
              error: `字段 ${schema.label} 中包含非法的数字：${segment}`
            };
          }
          numbers.push(parsed);
        }
        content[schema.key] = numbers;
        break;
      }
      default:
        content[schema.key] = raw ?? "";
    }
  }

  return { content };
};

const ActionFormDialog: React.FC<{
  mode: ActionModalMode;
  template: Template | null;
  action: Action | null;
  open: boolean;
  onClose: () => void;
  onSave: (draft: ActionDraft) => Promise<void>;
}> = ({ mode, template, action, open, onClose, onSave }) => {
  const [name, setName] = useState("");
  const [schemas, setSchemas] = useState<FieldSchema[]>([]);
  const [values, setValues] = useState<Record<string, string | boolean>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      return;
    }
    const existingContent = (action?.content ?? null) as ActionContent | null;
    setName(action?.name ?? template?.name ?? "");
    const fieldState = buildFieldState(template, existingContent);
    setSchemas(fieldState.schemas);
    setValues(fieldState.initialValues);
    setError(null);
    setSaving(false);
  }, [open, template, action]);

  const handleChange = useCallback((key: string, next: string | boolean) => {
    setValues((prev) => ({
      ...prev,
      [key]: next
    }));
  }, []);

  const previewJson = useMemo(() => {
    if (!open) {
      return "{}";
    }
    const { content } = collectFieldValues(schemas, values);
    try {
      return JSON.stringify(content, null, 2);
    } catch {
      return "{}";
    }
  }, [open, schemas, values]);

  if (!open) {
    return null;
  }

  const handleSave = async () => {
    if (!template) {
      setError("未选择模板，无法保存 Action");
      return;
    }
    if (!name.trim()) {
      setError("Action 名称不能为空");
      return;
    }

    const { content, error: collectError } = collectFieldValues(schemas, values);
    if (collectError) {
      setError(collectError);
      return;
    }

    const draft: ActionDraft = {
      id: action?.id,
      name: name.trim(),
      templateId: template.id,
      templateName: template.name,
      content
    };

    try {
      setSaving(true);
      await onSave(draft);
      onClose();
    } catch (err) {
      const message = err instanceof Error ? err.message : "保存失败，请稍后再试";
      setError(message);
    } finally {
      setSaving(false);
    }
  };

  const renderField = (field: FieldSchema) => {
    const current = values[field.key];
    switch (field.type) {
      case "string":
        return (
          <input
            className="field-input"
            value={(current as string) ?? ""}
            onChange={(event) => handleChange(field.key, event.target.value)}
            placeholder="请输入内容"
          />
        );
      case "number":
        return (
          <input
            className="field-input"
            type="number"
            value={(current as string) ?? ""}
            onChange={(event) => handleChange(field.key, event.target.value)}
            placeholder="请输入数值"
          />
        );
      case "bool":
        return (
          <label className="action-modal-switch">
            <input
              type="checkbox"
              checked={Boolean(current)}
              onChange={(event) => handleChange(field.key, event.target.checked)}
            />
            <span>启用</span>
          </label>
        );
      case "array-number":
        return (
          <textarea
            className="field-textarea"
            rows={2}
            value={(current as string) ?? ""}
            onChange={(event) => handleChange(field.key, event.target.value)}
            placeholder={
              field.nullable
                ? "以逗号分隔的数字，留空表示 null"
                : "以逗号分隔的数字"
            }
          />
        );
      case "readonly":
      default:
        return (
          <input
            className="field-input"
            value={(current as string) ?? ""}
            readOnly
          />
        );
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal-card action-modal"
        role="dialog"
        aria-modal="true"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="modal-card__header">
          <h2 className="modal-card__title">
            {mode === "edit" ? "编辑 Action" : "新建 Action"}
          </h2>
          {template ? (
            <span className="action-modal-template">模板：{template.name}</span>
          ) : null}
        </div>
        <div className="modal-card__content">
          <div className="field-group">
            <label className="field-label" htmlFor="action-name">
              Action 名称
            </label>
            <input
              id="action-name"
              className="field-input"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="请输入 Action 名称"
              disabled={saving}
            />
          </div>
          {schemas.length === 0 ? (
            <div className="action-modal-missing">
              模板中未包含可编辑字段，无法生成表单。
            </div>
          ) : (
            <div className="action-modal-fields">
              {schemas.map((field) => (
                <div className="field-group" key={field.key}>
                  <label className="field-label">{field.label}</label>
                  {renderField(field)}
                </div>
              ))}
            </div>
          )}
          <div className="action-modal-preview">
            <div className="action-modal-preview__header">
              <span className="action-modal-preview__title">JSON 预览</span>
              <span className="action-modal-preview__subtitle">
                保存时将写入的内容
              </span>
            </div>
            <pre className="action-modal-preview__code">{previewJson}</pre>
          </div>
          {error ? <div className="action-modal-error">{error}</div> : null}
        </div>
        <div className="modal-card__footer">
          <button className="secondary-button" onClick={onClose} disabled={saving}>
            取消
          </button>
          <button
            className="primary-button"
            onClick={handleSave}
            disabled={saving || !template}
          >
            {saving ? "保存中..." : "保存"}
          </button>
        </div>
      </div>
    </div>
  );
};

export const ActionManagementProvider: React.FC<ActionManagementProviderProps> = ({
  projectId,
  onTotalChange,
  children
}) => {
  const api = window.api ?? null;
  const [actions, setActions] = useState<Action[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loadingActions, setLoadingActions] = useState(false);
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const [modal, setModal] = useState<ModalState>({
    open: false,
    mode: "create",
    template: null,
    action: null
  });

  const fetchActions = useCallback(async () => {
    if (!api) {
      return;
    }
    setLoadingActions(true);
    try {
      const list = await api.getActions(projectId);
      setActions(list);
      onTotalChange?.(list.length);
    } catch (error) {
      console.error("加载 Action 列表失败", error);
    } finally {
      setLoadingActions(false);
    }
  }, [api, projectId, onTotalChange]);

  const fetchTemplates = useCallback(async () => {
    if (!api) {
      return;
    }
    setLoadingTemplates(true);
    try {
      const list = await api.getTemplates();
      setTemplates(list);
    } catch (error) {
      console.error("加载模板列表失败", error);
    } finally {
      setLoadingTemplates(false);
    }
  }, [api]);

  useEffect(() => {
    void fetchActions();
  }, [fetchActions]);

  useEffect(() => {
    void fetchTemplates();
  }, [fetchTemplates]);

  const saveAction = useCallback(
    async (draft: ActionDraft) => {
      if (!api) {
        throw new Error("系统桥接尚未就绪，无法保存 Action。");
      }
      if (draft.id) {
        await api.updateAction(projectId, draft.id, {
          id: draft.id,
          name: draft.name,
          templateId: draft.templateId,
          templateName: draft.templateName,
          content: draft.content
        });
      } else {
        const generatedId =
          typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
            ? crypto.randomUUID()
            : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
        await api.createAction(projectId, {
          id: generatedId,
          name: draft.name,
          templateId: draft.templateId,
          templateName: draft.templateName,
          content: draft.content
        });
      }
      await fetchActions();
    },
    [api, projectId, fetchActions]
  );

  const handleDeleteAction = useCallback(
    async (actionId: string) => {
      if (!api) {
        return;
      }
      await api.deleteAction(projectId, actionId);
      await fetchActions();
    },
    [api, projectId, fetchActions]
  );

  const handleDeleteActions = useCallback(
    async (ids: string[]) => {
      if (!api || ids.length === 0) {
        return;
      }
      await api.deleteActions(projectId, ids);
      await fetchActions();
    },
    [api, projectId, fetchActions]
  );

  const openCreateFromTemplate = useCallback((template: Template) => {
    setModal({
      open: true,
      mode: "create",
      template,
      action: null
    });
  }, []);

  const openEditAction = useCallback(
    (action: Action) => {
      const targetTemplate = templates.find((item) => item.id === action.templateId) ?? null;
      setModal({
        open: true,
        mode: "edit",
        template: targetTemplate,
        action
      });
    },
    [templates]
  );

  const closeModal = useCallback(() => {
    setModal({
      open: false,
      mode: "create",
      template: null,
      action: null
    });
  }, []);

  const contextValue = useMemo<ActionContextValue>(
    () => ({
      actions,
      templates,
      loadingActions,
      loadingTemplates,
      refreshActions: fetchActions,
      openCreateFromTemplate,
      openEditAction,
      deleteAction: handleDeleteAction,
      deleteActions: handleDeleteActions,
      modal,
      closeModal,
      saveAction
    }),
    [
      actions,
      templates,
      loadingActions,
      loadingTemplates,
      fetchActions,
      openCreateFromTemplate,
      openEditAction,
      handleDeleteAction,
      handleDeleteActions,
      modal,
      closeModal,
      saveAction
    ]
  );

  return (
    <ActionManagementContext.Provider value={contextValue}>
      {children}
      <ActionFormDialog
        open={modal.open}
        mode={modal.mode}
        template={modal.template}
        action={modal.action}
        onClose={closeModal}
        onSave={saveAction}
      />
    </ActionManagementContext.Provider>
  );
};

export const ActionManagementMain: React.FC = () => {
  const {
    actions,
    loadingActions,
    refreshActions,
    openEditAction,
    deleteAction,
    deleteActions
  } = useActionManagement();
  const [searchInput, setSearchInput] = useState("");
  const [keyword, setKeyword] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [page, setPage] = useState(1);

  useEffect(() => {
    setSelectedIds([]);
  }, [actions]);

  const filteredActions = useMemo(() => {
    if (!keyword.trim()) {
      return actions;
    }
    const lower = keyword.trim().toLowerCase();
    return actions.filter((item) => item.name.toLowerCase().includes(lower));
  }, [actions, keyword]);

  const totalPages = Math.max(1, Math.ceil(filteredActions.length / PAGE_SIZE));
  useEffect(() => {
    if (page > totalPages) {
      setPage(totalPages);
    }
  }, [page, totalPages]);

  const begin = (page - 1) * PAGE_SIZE;
  const currentItems = filteredActions.slice(begin, begin + PAGE_SIZE);
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

  const handleSingleDelete = async (target: Action) => {
    const ok = window.confirm(
      `确定要删除「${target.name}」吗？该操作不可恢复。`
    );
    if (!ok) {
      return;
    }
    await deleteAction(target.id);
  };

  const handleBatchDelete = async () => {
    if (selectedIds.length === 0) {
      window.alert("请先选择需要删除的 Action。");
      return;
    }
    const ok = window.confirm(
      `确定要批量删除 ${selectedIds.length} 个 Action 吗？该操作不可恢复。`
    );
    if (!ok) {
      return;
    }
    await deleteActions(selectedIds);
    setSelectedIds([]);
  };

  return (
    <div className="action-shell">
      <header className="action-header">
        <div className="action-search">
          <FiSearch aria-hidden="true" />
          <input
            className="action-search__input"
            placeholder="请输入 Action 名称"
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
          />
        </div>
        <div className="action-header-actions">
          <button className="secondary-button" onClick={handleQuery}>
            查询
          </button>
          <button
            className="danger-button"
            onClick={handleBatchDelete}
            disabled={selectedIds.length === 0}
          >
            <FiTrash />
            批量删除
          </button>
          <button className="secondary-button" onClick={() => void refreshActions()}>
            刷新
          </button>
        </div>
      </header>
      <section className="action-body">
        <div className="action-table-wrapper">
          <table className="action-table">
            <thead>
              <tr>
                <th style={{ width: "60px" }}>
                  <label className="action-checkbox" aria-label="全选当前页">
                    <input
                      type="checkbox"
                      checked={allChecked}
                      onChange={(event) => toggleSelectAll(event.target.checked)}
                    />
                    <span className="action-checkbox__indicator" />
                  </label>
                </th>
                <th style={{ width: "80px" }}>序号</th>
                <th>名称</th>
                <th>模板名称</th>
                <th style={{ width: "140px" }}>操作</th>
              </tr>
            </thead>
            <tbody>
              {loadingActions ? (
                <tr>
                  <td colSpan={5} className="action-table__status">
                    正在加载 Action...
                  </td>
                </tr>
              ) : currentItems.length === 0 ? (
                <tr>
                  <td colSpan={5} className="action-table__status">
                    {keyword ? "未查询到匹配的 Action。" : "暂无 Action 数据。"}
                  </td>
                </tr>
              ) : (
                currentItems.map((item, index) => (
                  <tr key={item.id}>
                    <td>
                      <label className="action-checkbox" aria-label={`选择 ${item.name}`}>
                        <input
                          type="checkbox"
                          checked={selectedIds.includes(item.id)}
                          onChange={(event) => toggleSelect(item.id, event.target.checked)}
                        />
                        <span className="action-checkbox__indicator" />
                      </label>
                    </td>
                    <td>{begin + index + 1}</td>
                    <td>{item.name}</td>
                    <td>{item.templateName || "-"}</td>
                    <td>
                      <div className="action-table__actions">
                        <button
                          type="button"
                          className="action-action-button"
                          onClick={() => openEditAction(item)}
                          title="编辑"
                        >
                          <FiEdit2 />
                        </button>
                        <button
                          type="button"
                          className="action-action-button action-action-button--danger"
                          onClick={() => void handleSingleDelete(item)}
                          title="删除"
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
        <div className="action-pagination">
          <span>
            共 {filteredActions.length} 条记录，每页 {PAGE_SIZE} 条
          </span>
          <div className="action-pagination__controls">
            <button
              className="secondary-button"
              disabled={page <= 1}
              onClick={() => setPage((prev) => Math.max(1, prev - 1))}
            >
              上一页
            </button>
            <span className="action-pagination__info">
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

export const ActionTemplatePanel: React.FC = () => {
  const { templates, loadingTemplates, openCreateFromTemplate } = useActionManagement();
  const [filter, setFilter] = useState("");

  useEffect(() => {
    setFilter("");
  }, [templates.length]);

  const filteredTemplates = useMemo(() => {
    if (!filter.trim()) {
      return templates;
    }
    const lower = filter.trim().toLowerCase();
    return templates.filter((item) => item.name.toLowerCase().includes(lower));
  }, [templates, filter]);

  return (
    <div className="action-template-panel">
      <div className="action-template-filter">
        <input
          className="action-template-filter__input"
          value={filter}
          onChange={(event) => setFilter(event.target.value)}
          placeholder="按模板名称筛选"
        />
      </div>
      {loadingTemplates ? (
        <div className="action-template-empty">正在加载模板...</div>
      ) : filteredTemplates.length === 0 ? (
        <div className="action-template-empty">暂无符合条件的模板。</div>
      ) : (
        <div className="action-template-grid">
          {filteredTemplates.map((template) => (
            <div
              key={template.id}
              className="action-template-card"
              role="button"
              tabIndex={0}
              onDoubleClick={() => openCreateFromTemplate(template)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  openCreateFromTemplate(template);
                }
              }}
            >
              <h3 className="action-template-card__title">{template.name}</h3>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
