/**
 * Policy 策略管理器
 * 负责策略的 CRUD 操作
 */
import crypto from 'crypto';
import type { Policy } from '../../types';

export class PolicyManager {
  private policies: Policy[] = [];

  /** 从持久化数据加载 */
  load(data: Policy[]): void {
    this.policies = data;
  }

  /** 导出用于持久化 */
  dump(): Policy[] {
    return this.policies;
  }

  /** 获取所有策略 */
  list(): Policy[] {
    return this.policies;
  }

  /** 获取策略详情 */
  get(id: string): Policy | undefined {
    return this.policies.find(p => p.id === id);
  }

  /** 创建策略 */
  create(data: Omit<Policy, 'id' | 'createdAt' | 'updatedAt'>): Policy {
    const now = Date.now();
    const policy: Policy = {
      ...data,
      id: `pol_${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`,
      createdAt: now,
      updatedAt: now,
    };
    this.policies.push(policy);
    return policy;
  }

  /** 更新策略 */
  update(id: string, data: Partial<Omit<Policy, 'id' | 'createdAt' | 'updatedAt'>>): Policy | null {
    const policy = this.policies.find(p => p.id === id);
    if (!policy) return null;

    // 更新字段
    const updatableFields: (keyof Policy)[] = [
      'name', 'description', 'routeId',
      'dailyTokenLimit', 'weeklyTokenLimit', 'monthlyTokenLimit',
      'customTokenLimit', 'customTokenResetHours',
      'dailyRequestLimit', 'weeklyRequestLimit', 'monthlyRequestLimit',
      'customRequestLimit', 'customRequestResetHours',
      'rpmLimit', 'concurrentLimit',
      'allowedModels', 'blockedModels',
    ];

    for (const field of updatableFields) {
      if ((data as any)[field] !== undefined) {
        (policy as any)[field] = (data as any)[field];
      }
    }

    policy.updatedAt = Date.now();
    return policy;
  }

  /** 删除策略 */
  delete(id: string): boolean {
    const index = this.policies.findIndex(p => p.id === id);
    if (index === -1) return false;
    this.policies.splice(index, 1);
    return true;
  }

  /** 复制策略 */
  duplicate(id: string): Policy | null {
    const source = this.policies.find(p => p.id === id);
    if (!source) return null;

    const { id: _id, createdAt: _ca, updatedAt: _ua, ...rest } = source;
    return this.create({
      ...rest,
      name: `${source.name} (副本)`,
    });
  }

  /** 获取策略预览信息 */
  getPreview(id: string): { policy: Policy; keyCount?: number } | null {
    const policy = this.policies.find(p => p.id === id);
    if (!policy) return null;
    return { policy };
  }

  /** 获取预置策略模板 */
  static getTemplates(): Array<{ name: string; description: string; config: Omit<Policy, 'id' | 'createdAt' | 'updatedAt'> }> {
    return [
      {
        name: '不限策略',
        description: '不限制任何用量，适合信任用户',
        config: { name: '不限策略' },
      },
      {
        name: '轻度限制',
        description: '月 Token 限额 5000k，日请求 500 次',
        config: {
          name: '轻度限制',
          monthlyTokenLimit: 5000,
          dailyRequestLimit: 500,
        },
      },
      {
        name: '中度限制',
        description: '月 Token 限额 2000k，日 Token 限额 200k，日请求 200 次，RPM 10',
        config: {
          name: '中度限制',
          dailyTokenLimit: 200,
          monthlyTokenLimit: 2000,
          dailyRequestLimit: 200,
          rpmLimit: 10,
        },
      },
      {
        name: '严格限制',
        description: '月 Token 限额 500k，日 Token 限额 50k，日请求 50 次，RPM 5，并发 2',
        config: {
          name: '严格限制',
          dailyTokenLimit: 50,
          monthlyTokenLimit: 500,
          dailyRequestLimit: 50,
          rpmLimit: 5,
          concurrentLimit: 2,
        },
      },
    ];
  }
}
