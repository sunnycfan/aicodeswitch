/**
 * AccessKey 管理器
 * 负责接入密钥的 CRUD 操作
 */
import crypto from 'crypto';
import type { AccessKey } from '../../types';

export class AccessKeyManager {
  private keys: AccessKey[] = [];
  /** apiKeyHash → AccessKey 索引，用于 O(1) 查找 */
  private hashIndex: Map<string, AccessKey> = new Map();

  /** 从持久化数据加载 */
  load(data: AccessKey[]): void {
    this.keys = data;
    this.rebuildIndex();
  }

  /** 导出用于持久化 */
  dump(): AccessKey[] {
    return this.keys;
  }

  /** 重建内存索引 */
  private rebuildIndex(): void {
    this.hashIndex.clear();
    for (const key of this.keys) {
      this.hashIndex.set(key.apiKeyHash, key);
    }
  }

  /** 通过 apiKeyHash 查找 AccessKey */
  findByHash(hash: string): AccessKey | undefined {
    return this.hashIndex.get(hash);
  }

  /** 通过 apiKey 值查找 AccessKey（计算 hash 后查找） */
  findByApiKey(apiKey: string): AccessKey | undefined {
    const hash = AccessKeyManager.hashApiKey(apiKey);
    return this.hashIndex.get(hash);
  }

  /** 获取所有密钥列表 */
  list(filters?: { status?: 'active' | 'disabled'; policyId?: string; search?: string }): AccessKey[] {
    let result = this.keys;
    if (filters?.status) {
      result = result.filter(k => k.status === filters.status);
    }
    if (filters?.policyId) {
      result = result.filter(k => k.policyId === filters.policyId);
    }
    if (filters?.search) {
      const q = filters.search.toLowerCase();
      result = result.filter(k =>
        k.name.toLowerCase().includes(q) ||
        (k.remark && k.remark.toLowerCase().includes(q))
      );
    }
    return result;
  }

  /** 获取密钥详情 */
  get(id: string): AccessKey | undefined {
    return this.keys.find(k => k.id === id);
  }

  /** 创建密钥 */
  create(data: { name: string; remark?: string; policyId?: string }): { key: AccessKey; apiKey: string } {
    const apiKey = AccessKeyManager.generateApiKey();
    const apiKeyHash = AccessKeyManager.hashApiKey(apiKey);
    const now = Date.now();

    const key: AccessKey = {
      id: `key_${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`,
      name: data.name,
      remark: data.remark,
      apiKey,
      apiKeyHash,
      policyId: data.policyId,
      status: 'active',
      createdAt: now,
      updatedAt: now,
    };

    this.keys.push(key);
    this.hashIndex.set(apiKeyHash, key);
    return { key, apiKey };
  }

  /** 更新密钥 */
  update(id: string, data: Partial<Pick<AccessKey, 'name' | 'remark' | 'policyId' | 'status'>>): AccessKey | null {
    const key = this.keys.find(k => k.id === id);
    if (!key) return null;

    if (data.name !== undefined) key.name = data.name;
    if (data.remark !== undefined) key.remark = data.remark;
    if (data.policyId !== undefined) key.policyId = data.policyId;
    if (data.status !== undefined) key.status = data.status;
    key.updatedAt = Date.now();

    return key;
  }

  /** 删除密钥 */
  delete(id: string): boolean {
    const index = this.keys.findIndex(k => k.id === id);
    if (index === -1) return false;
    const key = this.keys[index];
    this.hashIndex.delete(key.apiKeyHash);
    this.keys.splice(index, 1);
    return true;
  }

  /** 重新生成 API Key */
  regenerate(id: string): { apiKey: string; apiKeyHash: string } | null {
    const key = this.keys.find(k => k.id === id);
    if (!key) return null;

    // 移除旧索引
    this.hashIndex.delete(key.apiKeyHash);

    // 生成新的
    const apiKey = AccessKeyManager.generateApiKey();
    const apiKeyHash = AccessKeyManager.hashApiKey(apiKey);
    key.apiKey = apiKey;
    key.apiKeyHash = apiKeyHash;
    key.updatedAt = Date.now();

    // 添加新索引
    this.hashIndex.set(apiKeyHash, key);

    return { apiKey, apiKeyHash };
  }

  /** 批量更新状态 */
  batchUpdateStatus(keyIds: string[], status: 'active' | 'disabled'): number {
    let count = 0;
    for (const id of keyIds) {
      const key = this.keys.find(k => k.id === id);
      if (key) {
        key.status = status;
        key.updatedAt = Date.now();
        count++;
      }
    }
    return count;
  }

  /** 批量绑定策略 */
  batchBindPolicy(keyIds: string[], policyId: string): number {
    let count = 0;
    for (const id of keyIds) {
      const key = this.keys.find(k => k.id === id);
      if (key) {
        key.policyId = policyId;
        key.updatedAt = Date.now();
        count++;
      }
    }
    return count;
  }

  /** 批量删除 */
  batchDelete(keyIds: string[]): number {
    let count = 0;
    for (const id of keyIds) {
      const index = this.keys.findIndex(k => k.id === id);
      if (index !== -1) {
        const key = this.keys[index];
        this.hashIndex.delete(key.apiKeyHash);
        this.keys.splice(index, 1);
        count++;
      }
    }
    return count;
  }

  /** 更新最后活跃时间 */
  updateLastActive(id: string): void {
    const key = this.keys.find(k => k.id === id);
    if (key) {
      key.lastActiveAt = Date.now();
    }
  }

  /** 获取使用指定策略的密钥数量 */
  countByPolicyId(policyId: string): number {
    return this.keys.filter(k => k.policyId === policyId).length;
  }

  /** 获取使用指定策略的密钥列表 */
  listByPolicyId(policyId: string): AccessKey[] {
    return this.keys.filter(k => k.policyId === policyId);
  }

  /** 掩码化 API Key */
  static maskApiKey(apiKey: string): string {
    if (apiKey.length <= 8) return 'sk_****';
    return apiKey.slice(0, 4) + '****' + apiKey.slice(-4);
  }

  /** 生成 sk_ 前缀的 API Key */
  static generateApiKey(): string {
    return 'sk_' + crypto.randomBytes(24).toString('hex');
  }

  /** 计算 API Key 的哈希值 */
  static hashApiKey(apiKey: string): string {
    return crypto.createHash('sha256').update(apiKey).digest('hex').slice(0, 16);
  }
}
