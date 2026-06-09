import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import type { AccessKey, Policy, KeyUsage, KeyUsageDailyRecord, AccessKeyRequestLog } from '../../types';
import { toast } from '../components/Toast';
import { useConfirm } from '../components/Confirm';
import AccessKeyGuideModal from '../components/AccessKeyGuideModal';

export default function AccessKeyDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { confirm } = useConfirm();
  const [key, setKey] = useState<(AccessKey & { policyName?: string }) | null>(null);
  const [usage, setUsage] = useState<KeyUsage | null>(null);
  const [trend, setTrend] = useState<KeyUsageDailyRecord[]>([]);
  const [logs, setLogs] = useState<AccessKeyRequestLog[]>([]);
  const [logsTotal, setLogsTotal] = useState(0);
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [loading, setLoading] = useState(true);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editName, setEditName] = useState('');
  const [editRemark, setEditRemark] = useState('');
  const [editPolicyId, setEditPolicyId] = useState('');
  const [guideData, setGuideData] = useState<{ key: AccessKey; guide: any } | null>(null);

  const load = async () => {
    if (!id) return;
    setLoading(true);
    try {
      const [keyData, usageData, trendData, logData, policiesData] = await Promise.all([
        api.getAccessKey(id).catch(() => null),
        api.getAccessKeyUsage(id).catch(() => null),
        api.getAccessKeyUsageTrend(id, 30).catch(() => []),
        api.getAccessKeyLogs(id, { page: 1, pageSize: 10 }).catch(() => ({ data: [], total: 0 })),
        api.getPolicies().catch(() => []),
      ]);
      if (!keyData) {
        toast.error('密钥不存在');
        navigate('/access-keys');
        return;
      }
      setKey(keyData);
      setUsage(usageData);
      setTrend(trendData);
      setLogs(logData.data);
      setLogsTotal(logData.total);
      setPolicies(policiesData);
      setEditName(keyData.name);
      setEditRemark(keyData.remark || '');
      setEditPolicyId(keyData.policyId || '');
    } catch (err: any) {
      toast.error('加载数据失败: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [id]);

  const handleSave = async () => {
    if (!id || !editName.trim()) return;
    try {
      await api.updateAccessKey(id, {
        name: editName.trim(),
        remark: editRemark || undefined,
        policyId: editPolicyId || undefined,
      });
      toast.success('已保存');
      setShowEditModal(false);
      load();
    } catch (err: any) {
      toast.error('保存失败: ' + err.message);
    }
  };

  const handleToggleStatus = async () => {
    if (!key) return;
    try {
      await api.updateAccessKey(key.id, { status: key.status === 'active' ? 'disabled' : 'active' });
      toast.success(key.status === 'active' ? '已停用' : '已启用');
      load();
    } catch (err: any) {
      toast.error('操作失败: ' + err.message);
    }
  };

  const handleDelete = async () => {
    if (!key) return;
    const ok = await confirm({ message: '确定删除此密钥吗？' });
    if (!ok) return;
    try {
      await api.deleteAccessKey(key.id);
      toast.success('已删除');
      navigate('/access-keys');
    } catch (err: any) {
      toast.error('删除失败: ' + err.message);
    }
  };

  const handleGuide = async () => {
    if (!key) return;
    try {
      const guide = await api.getAccessKeyGuide(key.id);
      setGuideData({ key, guide });
    } catch (err: any) {
      toast.error('获取指引失败: ' + err.message);
    }
  };

  const formatToken = (n: number) => {
    if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
    if (n >= 1000) return (n / 1000).toFixed(1) + 'k';
    return String(n);
  };

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '8px 12px', borderRadius: '8px',
    border: '1px solid var(--border-primary)', background: 'var(--bg-secondary)',
    color: 'var(--text-primary)', boxSizing: 'border-box', fontSize: '14px',
  };

  if (loading) return <div style={{ textAlign: 'center', padding: '40px' }}>加载中...</div>;
  if (!key) return null;

  const successRate = usage && usage.lifetime.totalRequests > 0
    ? (((usage.lifetime.totalRequests - usage.lifetime.errorCount) / usage.lifetime.totalRequests) * 100).toFixed(1)
    : '-';

  const maxTrend = Math.max(...trend.map(t => t.tokens), 1);

  return (
    <div className="page-container">
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px' }}>
        <button className="btn btn-secondary" onClick={() => navigate('/access-keys')}>← 返回</button>
        <h2 style={{ flex: 1 }}>{key.name}</h2>
        <button className="ak-action-btn" style={{ padding: '6px 14px' }} onClick={() => setShowEditModal(true)}>编辑</button>
        <button className="ak-action-btn" style={{ padding: '6px 14px' }} onClick={handleToggleStatus}>
          {key.status === 'active' ? '停用' : '启用'}
        </button>
        <button className="ak-action-btn ak-action-btn--danger" style={{ padding: '6px 14px' }} onClick={handleDelete}>删除</button>
      </div>

      {/* 基本信息 */}
      <div style={{ background: 'var(--bg-secondary)', borderRadius: '8px', padding: '16px', marginBottom: '16px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px' }}>
          <div>
            <span style={{ color: 'var(--text-tertiary)', fontSize: '13px' }}>API Key</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <code>{key.apiKey}</code>
              <button className="ak-action-btn" onClick={handleGuide}>📋 接入指引</button>
            </div>
          </div>
          <div>
            <span style={{ color: 'var(--text-tertiary)', fontSize: '13px' }}>策略</span>
            <div>{key.policyName || <span style={{ color: 'var(--text-tertiary)' }}>未配置</span>}</div>
          </div>
          <div>
            <span style={{ color: 'var(--text-tertiary)', fontSize: '13px' }}>状态</span>
            <div>
              <span style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', background: key.status === 'active' ? 'var(--color-success, #22c55e)' : 'var(--text-tertiary)', marginRight: '6px' }} />
              {key.status === 'active' ? '启用' : '停用'}
            </div>
          </div>
          <div>
            <span style={{ color: 'var(--text-tertiary)', fontSize: '13px' }}>最后活跃</span>
            <div>{key.lastActiveAt ? new Date(key.lastActiveAt).toLocaleString() : '-'}</div>
          </div>
        </div>
      </div>

      {/* 概览卡片 */}
      {usage && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '12px', marginBottom: '16px' }}>
          {[
            { label: '累计 Token', value: formatToken(usage.lifetime.totalTokens) },
            { label: '累计请求', value: String(usage.lifetime.totalRequests) },
            { label: '成功率', value: successRate + '%' },
            { label: '错误数', value: String(usage.lifetime.errorCount) },
          ].map(card => (
            <div key={card.label} style={{ background: 'var(--bg-secondary)', borderRadius: '8px', padding: '16px', textAlign: 'center' }}>
              <div style={{ color: 'var(--text-tertiary)', fontSize: '13px', marginBottom: '4px' }}>{card.label}</div>
              <div style={{ fontSize: '20px', fontWeight: 600 }}>{card.value}</div>
            </div>
          ))}
        </div>
      )}

      {/* 趋势图 */}
      {trend.length > 0 && (
        <div style={{ background: 'var(--bg-secondary)', borderRadius: '8px', padding: '16px', marginBottom: '16px' }}>
          <h4 style={{ marginBottom: '12px' }}>Token 消耗趋势（最近 30 天）</h4>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: '2px', height: '100px' }}>
            {trend.slice(-30).map((t, i) => (
              <div key={i} style={{
                flex: 1, minWidth: 0,
                height: maxTrend > 0 ? `${Math.max(2, (t.tokens / maxTrend) * 100)}%` : '2px',
                background: 'var(--color-primary, #3b82f6)',
                borderRadius: '2px 2px 0 0',
                transition: 'height 0.2s',
              }} />
            ))}
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: 'var(--text-tertiary)', marginTop: '4px' }}>
            <span>{trend[0]?.date}</span>
            <span>{trend[trend.length - 1]?.date}</span>
          </div>
        </div>
      )}

      {/* 最近请求 */}
      <div style={{ background: 'var(--bg-secondary)', borderRadius: '8px', padding: '16px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
          <h4>最近请求</h4>
          {logsTotal > 10 && (
            <span style={{ color: 'var(--text-tertiary)', fontSize: '13px' }}>共 {logsTotal} 条</span>
          )}
        </div>
        {logs.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '20px', color: 'var(--text-tertiary)' }}>暂无请求记录</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border-primary)' }}>
                  <th style={{ padding: '6px', textAlign: 'left' }}>时间</th>
                  <th style={{ padding: '6px', textAlign: 'left' }}>模型</th>
                  <th style={{ padding: '6px', textAlign: 'right' }}>Token</th>
                  <th style={{ padding: '6px', textAlign: 'right' }}>耗时</th>
                  <th style={{ padding: '6px', textAlign: 'center' }}>状态</th>
                  <th style={{ padding: '6px', textAlign: 'left' }}>类型</th>
                </tr>
              </thead>
              <tbody>
                {logs.map(log => {
                  const tokens = log.usage?.totalTokens || (log.usage?.inputTokens || 0) + (log.usage?.outputTokens || 0);
                  return (
                    <tr key={log.id} style={{ borderBottom: '1px solid var(--border-primary)' }}>
                      <td style={{ padding: '6px' }}>{new Date(log.timestamp).toLocaleTimeString()}</td>
                      <td style={{ padding: '6px' }}>{log.requestModel || log.targetModel || '-'}</td>
                      <td style={{ padding: '6px', textAlign: 'right' }}>{formatToken(tokens)}</td>
                      <td style={{ padding: '6px', textAlign: 'right' }}>{log.responseTime ? (log.responseTime / 1000).toFixed(1) + 's' : '-'}</td>
                      <td style={{ padding: '6px', textAlign: 'center' }}>
                        {(log.statusCode || 200) < 400 ? '✅' : '❌'}
                      </td>
                      <td style={{ padding: '6px' }}>{log.contentType || '-'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 编辑弹窗 */}
      {showEditModal && (
        <div className="modal-overlay" onClick={() => setShowEditModal(false)}>
          <div className="modal" style={{ minWidth: 'auto', width: '480px', padding: '28px' }} onClick={e => e.stopPropagation()}>
            <button type="button" className="modal-close-btn"
              onClick={() => setShowEditModal(false)}
              style={{ top: '12px', right: '12px', width: '36px', height: '36px', fontSize: '24px' }}
              aria-label="关闭">×</button>
            <h3 style={{ margin: '0 0 20px', fontSize: '20px' }}>编辑密钥</h3>
            <div style={{ marginBottom: '14px' }}>
              <label style={{ display: 'block', marginBottom: '6px', fontWeight: 600, fontSize: '14px' }}>名称</label>
              <input type="text" value={editName} onChange={e => setEditName(e.target.value)} style={inputStyle} />
            </div>
            <div style={{ marginBottom: '14px' }}>
              <label style={{ display: 'block', marginBottom: '6px', fontWeight: 600, fontSize: '14px' }}>备注</label>
              <textarea value={editRemark} onChange={e => setEditRemark(e.target.value)}
                style={{ ...inputStyle, minHeight: '60px', resize: 'vertical' }} />
            </div>
            <div style={{ marginBottom: '24px' }}>
              <label style={{ display: 'block', marginBottom: '6px', fontWeight: 600, fontSize: '14px' }}>策略</label>
              <select value={editPolicyId} onChange={e => setEditPolicyId(e.target.value)}
                style={{ ...inputStyle, cursor: 'pointer' }}>
                <option value="">未配置</option>
                {policies.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button onClick={() => setShowEditModal(false)} className="ak-modal-btn-secondary">取消</button>
              <button onClick={handleSave} className="ak-modal-btn-primary">保存</button>
            </div>
          </div>
        </div>
      )}

      {/* 接入指引弹窗 */}
      {guideData && (
        <AccessKeyGuideModal
          keyName={guideData.key.name}
          apiKey={guideData.key.apiKey}
          guide={guideData.guide}
          onClose={() => setGuideData(null)}
        />
      )}

      {/* 深色模式样式 */}
      <style>{`
        .ak-action-btn {
          padding: 4px 10px; border-radius: 6px;
          border: 1px solid var(--border-primary);
          background: var(--bg-secondary);
          color: var(--text-secondary);
          cursor: pointer; font-size: 13px;
          transition: all 0.15s;
        }
        .ak-action-btn:hover {
          background: var(--bg-route-item-hover);
          border-color: var(--text-secondary);
        }
        .ak-action-btn--danger {
          color: var(--accent-danger);
        }
        .ak-action-btn--danger:hover {
          background: rgba(220, 38, 38, 0.1);
          border-color: var(--accent-danger);
        }
        .ak-modal-btn-primary {
          padding: 10px 28px; border-radius: 8px; border: none;
          background: var(--color-primary, #3b82f6); color: #fff;
          cursor: pointer; font-size: 14px; font-weight: 600;
          transition: opacity 0.15s;
        }
        .ak-modal-btn-primary:hover { opacity: 0.9; }
        .ak-modal-btn-secondary {
          padding: 10px 24px; border-radius: 8px;
          border: 1px solid var(--border-primary);
          background: var(--bg-secondary);
          color: var(--text-primary);
          cursor: pointer; font-size: 14px; font-weight: 500;
          transition: all 0.15s;
        }
        .ak-modal-btn-secondary:hover {
          background: var(--bg-route-item-hover);
        }

        /* 深色模式 */
        [data-theme="dark"] .ak-action-btn {
          background: rgba(30, 58, 40, 0.95);
          border-color: rgba(167, 243, 208, 0.2);
          color: #A7F3D0;
        }
        [data-theme="dark"] .ak-action-btn:hover {
          background: rgba(40, 75, 52, 0.95);
          border-color: rgba(167, 243, 208, 0.4);
        }
        [data-theme="dark"] .ak-action-btn--danger {
          color: #EF4444;
        }
        [data-theme="dark"] .ak-action-btn--danger:hover {
          background: rgba(239, 68, 68, 0.15);
          border-color: rgba(239, 68, 68, 0.5);
        }
        [data-theme="dark"] .ak-modal-btn-secondary {
          background: rgba(30, 58, 40, 0.95);
          border-color: rgba(167, 243, 208, 0.2);
          color: #ECFEF5;
        }
        [data-theme="dark"] .ak-modal-btn-secondary:hover {
          background: rgba(40, 75, 52, 0.95);
          border-color: rgba(167, 243, 208, 0.35);
        }
        [data-theme="dark"] .page-container select option {
          background: #0C1F12;
          color: #ECFEF5;
        }
        [data-theme="dark"] .page-container textarea,
        [data-theme="dark"] .page-container input[type="text"] {
          color-scheme: dark;
        }
      `}</style>
    </div>
  );
}
