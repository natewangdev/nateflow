import React, { useEffect, useState } from "react";
import type { AppSettings, ThemeMode } from "../shared/types";

interface SettingsDialogProps {
  open: boolean;
  settings: AppSettings | null;
  onClose: () => void;
  onSave: (data: Partial<AppSettings>) => Promise<void> | void;
  onPickDirectory: () => Promise<string | null>;
}

const SettingsDialog: React.FC<SettingsDialogProps> = ({
  open,
  settings,
  onClose,
  onSave,
  onPickDirectory
}) => {
  const [theme, setTheme] = useState<ThemeMode>("light");
  const [projectRoot, setProjectRoot] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open && settings) {
      setTheme(settings.theme);
      setProjectRoot(settings.projectRoot);
      setError(null);
    }
  }, [open, settings]);

  const handlePickDirectory = async () => {
    const picked = await onPickDirectory();
    if (picked) {
      setProjectRoot(picked);
    }
  };

  const handleSubmit = async () => {
    if (!projectRoot) {
      setError("请填写项目保存路径");
      return;
    }
    try {
      setSaving(true);
      await onSave({
        theme,
        projectRoot
      });
      setError(null);
    } catch (err) {
      setError((err as Error).message ?? "保存设置失败");
    } finally {
      setSaving(false);
    }
  };

  if (!open || !settings) {
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
          <h2 className="modal-card__title">系统设置</h2>
        </div>
        <div className="modal-card__content">
          <div className="settings-grid">
            <div className="field-group">
              <span className="field-label">主题模式</span>
              <div className="theme-toggle">
                <div
                  className={
                    theme === "light"
                      ? "theme-toggle__item theme-toggle__item--active"
                      : "theme-toggle__item"
                  }
                  onClick={() => setTheme("light")}
                >
                  浅色
                </div>
                <div
                  className={
                    theme === "dark"
                      ? "theme-toggle__item theme-toggle__item--active"
                      : "theme-toggle__item"
                  }
                  onClick={() => setTheme("dark")}
                >
                  深色
                </div>
              </div>
            </div>
            <div className="field-group">
              <span className="field-label">项目保存路径</span>
              <div className="path-input">
                <div className="path-input__field" title={projectRoot}>
                  {projectRoot}
                </div>
                <button
                  type="button"
                  className="path-input__button"
                  onClick={handlePickDirectory}
                >
                  选择目录
                </button>
              </div>
              <span className="field-label">
                默认目录会在程序根目录下创建 data/projects 文件夹。
              </span>
            </div>
            {error ? (
              <span style={{ color: "#ef4444", fontSize: "0.85rem" }}>
                {error}
              </span>
            ) : null}
          </div>
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

export default SettingsDialog;
