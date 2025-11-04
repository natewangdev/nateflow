import React, { useEffect, useMemo, useState } from "react";
import type { Project, ProjectPayload } from "../shared/types";

interface ProjectModalProps {
  open: boolean;
  mode: "create" | "edit";
  project?: Project;
  onClose: () => void;
  onSave: (payload: ProjectPayload) => Promise<void> | void;
}

const ProjectModal: React.FC<ProjectModalProps> = ({
  open,
  mode,
  project,
  onClose,
  onSave
}) => {
  const [name, setName] = useState("");
  const [imageBase64, setImageBase64] = useState<string | undefined>();
  const [preview, setPreview] = useState<string | undefined>();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setName(project?.name ?? "");
      setImageBase64(project?.imageBase64);
      setPreview(project?.imageBase64);
      setError(null);
    }
  }, [open, project]);

  const title = useMemo(
    () => (mode === "create" ? "新建项目" : "编辑项目"),
    [mode]
  );

  const handlePickImage = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }
    if (!file.type.startsWith("image/")) {
      setError("仅支持上传图片文件");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      setImageBase64(result);
      setPreview(result);
      setError(null);
    };
    reader.onerror = () => {
      setError("读取图片失败，请重试");
    };
    reader.readAsDataURL(file);
  };

  const handleClearImage = () => {
    setImageBase64(undefined);
    setPreview(undefined);
  };

  const handleSubmit = async () => {
    if (!name.trim()) {
      setError("请输入项目名称");
      return;
    }
    try {
      setSaving(true);
      await onSave({
        id: project?.id,
        name: name.trim(),
        imageBase64
      });
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
        className="modal-card"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="modal-card__header">
          <h2 className="modal-card__title">{title}</h2>
        </div>
        <div className="modal-card__content">
          <div className="field-group">
            <label className="field-label" htmlFor="project-name">
              项目名称
            </label>
            <input
              id="project-name"
              className="field-input"
              placeholder="请输入项目名称"
              value={name}
              onChange={(event) => setName(event.target.value)}
              disabled={saving}
            />
          </div>
          <div className="field-group">
            <span className="field-label">项目图片</span>
            <div className="path-input">
              <label className="path-input__button" htmlFor="project-image">
                上传图片
              </label>
              <button
                type="button"
                className="path-input__button"
                onClick={handleClearImage}
                disabled={!preview}
              >
                清除图片
              </button>
              <input
                id="project-image"
                type="file"
                accept="image/*"
                style={{ display: "none" }}
                onChange={handlePickImage}
              />
            </div>
            <div className="image-preview">
              {preview ? (
                <img src={preview} alt="项目图片预览" />
              ) : (
                <span style={{ color: "var(--color-text-muted)" }}>
                  还未选择图片
                </span>
              )}
            </div>
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

export default ProjectModal;
