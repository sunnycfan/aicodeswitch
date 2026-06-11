import { useState } from 'react';
import { api } from '../api/client';
import { toast } from './Toast';

interface Props {
  onClose: () => void;
  onCleared: () => void;
}

const DAY_OPTIONS = Array.from({ length: 15 }, (_, i) => i + 1);

export function ClearSessionsModal({ onClose, onCleared }: Props) {
  const [beforeDays, setBeforeDays] = useState(7);
  const [onlyLogs, setOnlyLogs] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleConfirm = async () => {
    setLoading(true);
    try {
      const result = await api.cleanupSessions(beforeDays, onlyLogs);
      if (result.sessionsAffected === 0) {
        toast.info('没有符合条件的会话需要清除');
      } else if (onlyLogs) {
        toast.success(`已清除 ${result.sessionsAffected} 个会话的日志（共 ${result.logsDeleted} 条），会话记录已保留`);
      } else {
        toast.success(`已清除 ${result.sessionsAffected} 个会话及其关联日志（共 ${result.logsDeleted} 条）`);
      }
      onCleared();
      onClose();
    } catch (err: any) {
      toast.error(err.message || '清除会话失败');
    } finally {
      setLoading(false);
    }
  };

  const warningText = onlyLogs
    ? `将删除最后请求在 ${beforeDays} 天以前的会话所关联的日志，会话记录本身将被保留。`
    : `将永久删除最后请求在 ${beforeDays} 天以前的会话，及其所有关联日志。此操作不可撤销。`;

  return (
    <div className="modal-overlay">
      <button
        type="button"
        className="modal-close-btn"
        onClick={onClose}
        aria-label="关闭"
      >×</button>
      <div className="modal" style={{ width: '480px', maxWidth: '90vw' }}>
        {/* Header */}
        <div className="modal-header">
          <h2>清除会话</h2>
          <div style={{ fontSize: '13px', color: 'var(--text-tertiary)', marginLeft: '12px' }}>
            按最后请求时间清理过期会话
          </div>
        </div>

        {/* Body */}
        <div className="modal-body-scrollable" style={{ padding: '20px' }}>
          {/* 清除范围 */}
          <div style={{ marginBottom: '20px' }}>
            <label style={{ display: 'block', marginBottom: '10px', fontWeight: 500, color: 'var(--text-secondary)', fontSize: '13px' }}>
              清除范围
            </label>
            <div style={{
              padding: '14px 16px',
              backgroundColor: 'var(--bg-secondary)',
              borderRadius: '8px',
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              flexWrap: 'wrap',
            }}>
              <span style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>最后请求在</span>
              <select
                value={beforeDays}
                onChange={(e) => setBeforeDays(Number(e.target.value))}
                disabled={loading}
                style={{
                  padding: '6px 10px',
                  borderRadius: '6px',
                  border: '1px solid var(--border-primary)',
                  backgroundColor: 'var(--bg-primary)',
                  color: 'var(--text-primary)',
                  fontSize: '14px',
                  cursor: 'pointer',
                }}
              >
                {DAY_OPTIONS.map(d => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
              <span style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>天以前的会话</span>
            </div>
          </div>

          {/* 仅清空日志 开关 */}
          <div
            onClick={() => !loading && setOnlyLogs(v => !v)}
            style={{
              padding: '14px 16px',
              borderRadius: '8px',
              border: `2px solid ${onlyLogs ? 'var(--color-primary, #2980b9)' : 'var(--border-primary, #e0e0e0)'}`,
              backgroundColor: onlyLogs ? 'var(--bg-route-item-selected, rgba(41, 128, 185, 0.08))' : 'var(--bg-primary)',
              cursor: loading ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '12px',
              opacity: loading ? 0.6 : 1,
            }}
          >
            <div>
              <div style={{ fontWeight: 500, fontSize: '14px', color: 'var(--text-primary)' }}>
                仅清空日志
              </div>
              <div style={{ fontSize: '12px', color: 'var(--text-tertiary)', marginTop: '4px' }}>
                开启后保留会话记录，仅删除这些会话的关联日志
              </div>
            </div>
            {/* Toggle */}
            <div style={{
              width: '40px',
              height: '22px',
              borderRadius: '11px',
              backgroundColor: onlyLogs ? 'var(--color-primary, #2980b9)' : 'var(--border-secondary, #ccc)',
              position: 'relative',
              transition: 'background-color 0.15s ease',
              flexShrink: 0,
            }}>
              <div style={{
                position: 'absolute',
                top: '2px',
                left: onlyLogs ? '20px' : '2px',
                width: '18px',
                height: '18px',
                borderRadius: '50%',
                backgroundColor: '#fff',
                transition: 'left 0.15s ease',
                boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
              }} />
            </div>
          </div>

          {/* 警告 */}
          <div style={{
            marginTop: '20px',
            padding: '12px 14px',
            backgroundColor: 'rgba(231, 76, 60, 0.08)',
            border: '1px solid rgba(231, 76, 60, 0.3)',
            borderRadius: '6px',
            fontSize: '13px',
            color: '#c0392b',
            lineHeight: 1.5,
          }}>
            <strong>⚠️ 警告：</strong>{warningText}
          </div>
        </div>

        {/* Footer */}
        <div className="modal-footer">
          <div style={{ flex: 1 }} />
          <button
            className="btn btn-secondary"
            onClick={onClose}
            disabled={loading}
          >
            取消
          </button>
          <button
            className="btn btn-danger"
            onClick={handleConfirm}
            disabled={loading}
          >
            {loading ? '处理中...' : '确认清除'}
          </button>
        </div>
      </div>
    </div>
  );
}
