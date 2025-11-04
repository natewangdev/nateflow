import React, { useCallback, useEffect, useMemo, useState } from "react";
import { FiEdit2, FiTrash, FiTrash2 } from "react-icons/fi";
import TemplateModal from "./TemplateModal";
import type { Template, TemplateContent } from "../shared/types";

interface TemplateManagementProps {
  onTotalChange?: (total: number) => void;
}

const pageSize = 15;

const TemplateManagement: React.FC<TemplateManagementProps> = ({ onTotalChange }) => {
  const api = window.api ?? null;
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchInput, setSearchInput] = useState("");
  const [keyword, setKeyword] = useState("");
  const [page, setPage] = useState(1);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<Template | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [batchDeleting, setBatchDeleting] = useState(false);

  const fetchTemplates = useCallback(async () => {
    if (!api) {
      setError("系统桥接尚未就绪，无法获取模板数据");
      return;
    }
    setLoading(true);
    try {
      const list = await api.getTemplates();
      setTemplates(list);
      setSelectedIds([]);
      onTotalChange?.(list.length);
      setError(null);
    } catch (err) {
      console.error("加载模板失败", err);
      setError("加载模板列表失败，请稍后重试");
    } finally {
      setLoading(false);
    }
  }, [api, onTotalChange]);

  useEffect(() => {
    void fetchTemplates();
  }, [fetchTemplates]);

  const filteredTemplates = useMemo(() => {
    if (!keyword.trim()) {
      return templates;
    }
    const lower = keyword.trim().toLowerCase();
    return templates.filter((template) => {
      const nameMatch = template.name.toLowerCase().includes(lower);
      const descMatch = template.description.toLowerCase().includes(lower);
      return nameMatch || descMatch;
    });
  }, [templates, keyword]);

  useEffect(() => {
    const maxPage = Math.max(1, Math.ceil(filteredTemplates.length / pageSize));
    if (page > maxPage) {
      setPage(maxPage);
    }
  }, [filteredTemplates.length, page]);

  const begin = (page - 1) * pageSize;
  const currentPageItems = filteredTemplates.slice(begin, begin + pageSize);
  const totalPages = Math.max(1, Math.ceil(filteredTemplates.length / pageSize));

  const toggleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedIds(currentPageItems.map((item) => item.id));
    } else {
      setSelectedIds([]);
    }
  };

  const toggleSelectOne = (id: string, checked: boolean) => {
    setSelectedIds((prev) => {
      if (checked) {
        return Array.from(new Set([...prev, id]));
      }
      return prev.filter((item) => item !== id);
    });
  };

  const openCreateModal = () => {
    setEditingTemplate(null);
    setModalOpen(true);
  };

  const openEditModal = (template: Template) => {
    setEditingTemplate(template);
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
  };

  const handleSaveTemplate = async (payload: { id?: string; name: string; description: string; content: TemplateContent }) => {
    if (!api) {
      window.alert("系统桥接尚未就绪，无法保存模板");
      return;
    }
    try {
      if (payload.id) {
        await api.updateTemplate(payload.id, {
          id: payload.id,
          name: payload.name,
          description: payload.description,
          content: payload.content
        });
      } else {
        await api.createTemplate({
          name: payload.name,
          description: payload.description,
          content: payload.content
        });
      }
      setModalOpen(false);
      await fetchTemplates();
    } catch (err) {
      console.error("保存模板失败", err);
      window.alert((err as Error).message ?? "保存模板失败");
    }
  };

  const handleDeleteTemplate = async (template: Template) => {
    if (!api) {
      window.alert("系统桥接尚未就绪，无法删除模板");
      return;
    }
    const confirmed = window.confirm(`确认删除模板「${template.name}」？`);
    if (!confirmed) {
      return;
    }
    try {
      await api.deleteTemplate(template.id);
      await fetchTemplates();
    } catch (err) {
      console.error("删除模板失败", err);
      window.alert("删除模板失败，请稍后再试");
    }
  };

  const handleBatchDelete = async () => {
    if (!api || selectedIds.length === 0) {
      return;
    }
    const templatesToDelete = templates.filter((template) =>
      selectedIds.includes(template.id)
    );
    const confirmed = window.confirm(`确认删除选中的 ${templatesToDelete.length} 个模板？`);
    if (!confirmed) {
      return;
    }
    try {
      setBatchDeleting(true);
      await Promise.all(
        templatesToDelete.map((template) => api.deleteTemplate(template.id))
      );
      await fetchTemplates();
    } catch (err) {
      console.error("批量删除模板失败", err);
      window.alert("批量删除模板失败，请稍后再试");
    } finally {
      setBatchDeleting(false);
    }
  };

  const handleQuery = () => {
    setKeyword(searchInput.trim());
    setPage(1);
  };

  const handleReset = () => {
    setSearchInput("");
    setKeyword("");
    setPage(1);
  };

  const allChecked =
    selectedIds.length > 0 && currentPageItems.every((item) => selectedIds.includes(item.id));

  return (
    <div className="template-shell">
      <header className="template-header">
        <div className="template-search">
          <input
            className="template-search__input"
            placeholder="请输入模板名称或描述"
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                handleQuery();
              }
            }}
          />
          <button className="primary-button" onClick={handleQuery} disabled={loading}>
            查询
          </button>
          <button className="secondary-button" onClick={handleReset} disabled={loading}>
            重置
          </button>
        </div>
        <div className="template-header-actions">
          <button
            type="button"
            className="danger-button"
            onClick={handleBatchDelete}
            disabled={batchDeleting || selectedIds.length === 0 || loading}
          >
            {batchDeleting ? (
              "删除中..."
            ) : (
              <>
                <FiTrash /> 批量删除
              </>
            )}
          </button>
          <button className="primary-button" onClick={openCreateModal} disabled={loading}>
            新建模板
          </button>
        </div>
      </header>
      <section className="template-body">
        {error ? <div className="template-error">{error}</div> : null}
        <div className="template-table-wrapper">
          <table className="template-table">
            <thead>
              <tr>
                <th style={{ width: "60px" }}>
                  <label className="template-checkbox" aria-label="全选当前页模板">
                    <input
                      type="checkbox"
                      checked={allChecked}
                      onChange={(event) => toggleSelectAll(event.target.checked)}
                    />
                    <span className="template-checkbox__indicator" />
                  </label>
                </th>
                <th style={{ width: "80px" }}>序号</th>
                <th style={{ minWidth: "180px" }}>名称</th>
                <th style={{ minWidth: "220px" }}>描述</th>
                <th style={{ width: "160px" }}>操作</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={5} className="template-table__loading">
                    正在加载模板...
                  </td>
                </tr>
              ) : currentPageItems.length === 0 ? (
                <tr>
                  <td colSpan={5} className="template-table__empty">
                    {keyword ? "未查询到匹配的模板" : "当前没有模板数据"}
                  </td>
                </tr>
              ) : (
                currentPageItems.map((template, index) => (
                  <tr key={template.id}>
                    <td>
                      <label
                        className="template-checkbox"
                        aria-label={`选择模板 ${template.name}`}
                      >
                        <input
                          type="checkbox"
                          checked={selectedIds.includes(template.id)}
                          onChange={(event) =>
                            toggleSelectOne(template.id, event.target.checked)
                          }
                        />
                        <span className="template-checkbox__indicator" />
                      </label>
                    </td>
                    <td>{begin + index + 1}</td>
                    <td>{template.name}</td>
                    <td>{template.description || "-"}</td>
                    <td>
                      <div className="template-table__actions">
                        <button
                          type="button"
                          className="template-action-button"
                          onClick={() => openEditModal(template)}
                          title="编辑模板"
                        >
                          <FiEdit2 />
                        </button>
                        <button
                          type="button"
                          className="template-action-button template-action-button--danger"
                          onClick={() => handleDeleteTemplate(template)}
                          title="删除模板"
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
        <div className="template-pagination">
          <span>
            共 {filteredTemplates.length} 条记录，每页 {pageSize} 条
          </span>
          <div className="template-pagination__controls">
            <button
              className="secondary-button"
              disabled={page <= 1}
              onClick={() => setPage((prev) => Math.max(1, prev - 1))}
            >
              上一页
            </button>
            <span className="template-pagination__info">
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
      <TemplateModal
        open={modalOpen}
        template={editingTemplate}
        onClose={closeModal}
        onSave={handleSaveTemplate}
      />
    </div>
  );
};

export default TemplateManagement;


