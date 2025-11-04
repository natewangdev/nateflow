import React, { useEffect, useState } from "react";
import type { Template, TemplateContent } from "../shared/types";

interface TemplateModalProps {
  open: boolean;
  template?: Template | null;
  onClose: () => void;
  onSave: (payload: { id?: string; name: string; description: string; content: TemplateContent }) => Promise<void> | void;
}

const defaultJson = '{\n  "key": "value"\n}';

const stringifyContent = (value: TemplateContent) => {
  return JSON.stringify(value, null, 2);
};

const TemplateModal: React.FC<TemplateModalProps> = ({
  open,
  template,
  onClose,
  onSave
}) => {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [jsonContent, setJsonContent] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setName(template?.name ?? "");
      setDescription(template?.description ?? "");
      setJsonContent(template ? stringifyContent(template.content) : defaultJson);
      setError(null);
    }
  }, [open, template]);

  const handleSubmit = async () => {
    if (!name.trim()) {
      setError("请输入模板名称");
      return;
    }
    if (!jsonContent.trim()) {
      setError("请输入模板 JSON 内容");
      return;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(jsonContent);
    } catch (err) {
      setError("模板内容不是合法的 JSON，请检查格式");
      return;
    }
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      setError("模板内容必须是一个 JSON 对象");
      return;
    }
    try {
      setSaving(true);
      await onSave({
        id: template?.id,
        name: name.trim(),
        description: description.trim(),
        content: parsed as TemplateContent
      });
      setError(null);
    } finally {
      setSaving(false);
    }
  };

  if (!open) {
    return null;
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal-card"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="modal-card__header">
          <h2 className="modal-card__title">
            {template ? "编辑模板" : "新建模板"}
          </h2>
        </div>
        <div className="modal-card__content">
          <div className="field-group">
            <label className="field-label" htmlFor="template-name">
              模板名称
            </label>
            <input
              id="template-name"
              className="field-input"
              placeholder="请输入模板名称"
              value={name}
              onChange={(event) => setName(event.target.value)}
              disabled={saving}
            />
          </div>
          <div className="field-group">
            <label className="field-label" htmlFor="template-description">
              描述
            </label>
            <input
              id="template-description"
              className="field-input"
              placeholder="请输入模板描述"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              disabled={saving}
            />
          </div>
          <div className="field-group">
            <label className="field-label" htmlFor="template-json">
              JSON 内容
            </label>
            <textarea
              id="template-json"
              className="json-textarea"
              value={jsonContent}
              onChange={(event) => setJsonContent(event.target.value)}
              disabled={saving}
              rows={12}
              spellCheck={false}
            />
          </div>
          {error ? (
            <span style={{ color: "#ef4444", fontSize: "0.85rem" }}>{error}</span>
          ) : null}
        </div>
        <div className="modal-card__footer">
          <button className="secondary-button" onClick={onClose} disabled={saving}>
            取消
          </button>
          <button className="primary-button" onClick={handleSubmit} disabled={saving}>
            {saving ? "保存中..." : "保存"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default TemplateModal;
