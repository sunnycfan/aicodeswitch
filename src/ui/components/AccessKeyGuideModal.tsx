import { toast } from './Toast';

interface AccessKeyGuideModalProps {
  /** 密钥名称 */
  keyName: string;
  /** 密钥掩码值 (sk_...) */
  apiKey: string;
  /** 接入指引数据 (来自 API)，null 时显示掩码 fallback */
  guide: Record<string, any> | null;
  /** 关闭回调 */
  onClose: () => void;
}

export default function AccessKeyGuideModal({ keyName, apiKey, guide, onClose }: AccessKeyGuideModalProps) {
  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text).then(() => toast.success('已复制'));
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ minWidth: 'auto', width: '700px', padding: '28px' }} onClick={e => e.stopPropagation()}>
        <button type="button" className="modal-close-btn"
          onClick={onClose}
          style={{ top: '12px', right: '12px', width: '36px', height: '36px', fontSize: '24px' }}
          aria-label="关闭">×</button>
        <h3 style={{ margin: '0 0 4px', fontSize: '20px' }}>📋 接入指引</h3>
        <p style={{ margin: '0 0 22px', color: 'var(--text-tertiary)', fontSize: '13px' }}>
          密钥「{keyName}」的接入配置
        </p>
        {guide ? (
          (() => {
            const allEntries = Object.values(guide).flatMap((s: any) => Object.keys(s.envVars || {}));
            const globalMaxLen = Math.max(...allEntries.map(k => k.length), 0);
            return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginBottom: '20px' }}>
            {Object.entries(guide).map(([sectionKey, section]: [string, any]) => {
              const entries = Object.entries(section.envVars) as [string, string][];
              return (
                <div key={sectionKey} className="ak-guide-section">
                  <div className="ak-guide-section-header">
                    {section.description}
                  </div>
                  <div style={{ padding: '14px 16px' }}>
                    {entries.map(([k, v]) => (
                      <div key={k} style={{
                        display: 'flex', alignItems: 'center', gap: '0',
                        marginBottom: '8px', fontSize: '13px',
                      }}>
                        <span className="ak-guide-env-name" style={{ minWidth: `${globalMaxLen * 8.5}px` }}>{k}</span>
                        <span style={{ color: 'var(--text-secondary)', margin: '0 8px' }}>=</span>
                        <code className="ak-guide-env-value">{v}</code>
                        <button className="btn btn-sm ak-action-btn"
                          onClick={() => copyToClipboard(v)}
                          style={{ flexShrink: 0, padding: '4px 8px', marginLeft: '8px' }}>复制</button>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
            );
          })()
        ) : (
          <div style={{ marginBottom: '20px', textAlign: 'center', padding: '30px 0' }}>
            <div style={{ fontSize: '36px', marginBottom: '8px' }}>🔑</div>
            <div style={{ fontWeight: 600, fontSize: '15px', marginBottom: '12px' }}>API Key</div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
              <code style={{
                padding: '12px 16px', borderRadius: '8px', background: 'var(--bg-primary-solid)',
                fontSize: '14px', fontFamily: '"SF Mono", "Fira Code", monospace',
                border: '2px dashed var(--color-primary)',
              }}>{apiKey}</code>
            </div>
            <span style={{ fontSize: '11px', color: 'var(--text-tertiary)', display: 'block', marginTop: '8px' }}>完整 Key 仅在创建时展示，此处仅显示掩码</span>
          </div>
        )}
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button onClick={onClose} className="ak-modal-btn-secondary">关闭</button>
        </div>
      </div>

      <style>{`
        .ak-guide-section {
          border-radius: 10px;
          border: 1px solid var(--border-primary);
          overflow: hidden;
          background: var(--bg-primary-solid);
        }
        .ak-guide-section-header {
          padding: 10px 16px;
          border-bottom: 1px solid var(--border-primary);
          background: var(--bg-secondary);
          fontWeight: 600;
          font-size: 14px;
        }
        .ak-guide-env-name {
          color: var(--color-accent, #8b5cf6);
          fontWeight: 600;
          fontFamily: "SF Mono", "Fira Code", monospace;
          flexShrink: 0;
        }
        .ak-guide-env-value {
          flex: 1;
          padding: 6px 10px;
          border-radius: 5px;
          background: var(--bg-secondary);
          wordBreak: break-all;
          fontSize: 12px;
          fontFamily: "SF Mono", "Fira Code", monospace;
        }
        [data-theme="dark"] .ak-guide-section {
          background: #0C1F12;
          border-color: rgba(167, 243, 208, 0.15);
        }
        [data-theme="dark"] .ak-guide-section-header {
          background: rgba(30, 58, 40, 0.95);
          border-color: rgba(167, 243, 208, 0.15);
        }
        [data-theme="dark"] .ak-guide-env-value {
          background: rgba(30, 58, 40, 0.95);
        }
      `}</style>
    </div>
  );
}
