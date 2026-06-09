/**
 * 配额检查器
 * 负责检查 Token/请求次数/RPM/并发 等配额限制
 */
import type { Policy, KeyUsage } from '../../types';

/** RPM 滑动窗口计数器 */
interface SlidingWindowCounter {
  timestamps: number[];
}

export class QuotaChecker {
  /** per keyId: 滑动窗口（60秒） */
  private rpmTracker: Map<string, SlidingWindowCounter> = new Map();
  /** per keyId: 当前并发数 */
  private concurrentTracker: Map<string, number> = new Map();

  /**
   * 检查所有配额限制，返回 null 表示通过，否则返回错误信息
   */
  checkQuota(policy: Policy, usage: KeyUsage | null, keyId: string, requestModel?: string): QuotaCheckResult | null {
    // 1. 模型过滤
    if (requestModel) {
      if (policy.allowedModels && policy.allowedModels.length > 0) {
        if (!policy.allowedModels.some(m => this.matchModel(m, requestModel))) {
          return { error: 'MODEL_NOT_ALLOWED', message: `模型 ${requestModel} 不在允许列表中`, httpStatus: 403 };
        }
      }
      if (policy.blockedModels && policy.blockedModels.length > 0) {
        if (policy.blockedModels.some(m => this.matchModel(m, requestModel))) {
          return { error: 'MODEL_NOT_ALLOWED', message: `模型 ${requestModel} 已被禁止使用`, httpStatus: 403 };
        }
      }
    }

    if (!usage) return null; // 无用量数据，跳过其余检查

    const now = Date.now();

    // 2. Token 日限额
    if (policy.dailyTokenLimit) {
      const limit = policy.dailyTokenLimit * 1000; // k → 实际 tokens
      if (this.isPeriodExpired(usage.periods.daily.periodStart, 'daily')) {
        // 周期已重置，通过
      } else if (usage.periods.daily.tokens >= limit) {
        return { error: 'TOKEN_QUOTA_EXCEEDED', message: '今日 Token 配额已用尽', httpStatus: 429, dimension: 'dailyTokenLimit', usage: usage.periods.daily.tokens, limit };
      }
    }

    // 3. Token 周限额
    if (policy.weeklyTokenLimit) {
      const limit = policy.weeklyTokenLimit * 1000;
      if (this.isPeriodExpired(usage.periods.weekly.periodStart, 'weekly')) {
        // 周期已重置，通过
      } else if (usage.periods.weekly.tokens >= limit) {
        return { error: 'TOKEN_QUOTA_EXCEEDED', message: '本周 Token 配额已用尽', httpStatus: 429, dimension: 'weeklyTokenLimit', usage: usage.periods.weekly.tokens, limit };
      }
    }

    // 4. Token 月限额
    if (policy.monthlyTokenLimit) {
      const limit = policy.monthlyTokenLimit * 1000;
      if (this.isPeriodExpired(usage.periods.monthly.periodStart, 'monthly')) {
        // 周期已重置，通过
      } else if (usage.periods.monthly.tokens >= limit) {
        return { error: 'TOKEN_QUOTA_EXCEEDED', message: '本月 Token 配额已用尽', httpStatus: 429, dimension: 'monthlyTokenLimit', usage: usage.periods.monthly.tokens, limit };
      }
    }

    // 5. Token 自定义周期
    if (policy.customTokenLimit && policy.customTokenResetHours && usage.periods.custom) {
      const limit = policy.customTokenLimit * 1000;
      const resetMs = policy.customTokenResetHours * 3600 * 1000;
      if (now - usage.periods.custom.periodStart >= resetMs) {
        // 周期已重置，通过
      } else if (usage.periods.custom.tokens >= limit) {
        return { error: 'TOKEN_QUOTA_EXCEEDED', message: 'Token 配额已用尽', httpStatus: 429, dimension: 'customTokenLimit', usage: usage.periods.custom.tokens, limit };
      }
    }

    // 6. 请求日限额
    if (policy.dailyRequestLimit) {
      if (!this.isPeriodExpired(usage.periods.daily.periodStart, 'daily') && usage.periods.daily.requests >= policy.dailyRequestLimit) {
        return { error: 'REQUEST_QUOTA_EXCEEDED', message: '今日请求次数已用尽', httpStatus: 429, dimension: 'dailyRequestLimit', usage: usage.periods.daily.requests, limit: policy.dailyRequestLimit };
      }
    }

    // 7. 请求周限额
    if (policy.weeklyRequestLimit) {
      if (!this.isPeriodExpired(usage.periods.weekly.periodStart, 'weekly') && usage.periods.weekly.requests >= policy.weeklyRequestLimit) {
        return { error: 'REQUEST_QUOTA_EXCEEDED', message: '本周请求次数已用尽', httpStatus: 429, dimension: 'weeklyRequestLimit', usage: usage.periods.weekly.requests, limit: policy.weeklyRequestLimit };
      }
    }

    // 8. 请求月限额
    if (policy.monthlyRequestLimit) {
      if (!this.isPeriodExpired(usage.periods.monthly.periodStart, 'monthly') && usage.periods.monthly.requests >= policy.monthlyRequestLimit) {
        return { error: 'REQUEST_QUOTA_EXCEEDED', message: '本月请求次数已用尽', httpStatus: 429, dimension: 'monthlyRequestLimit', usage: usage.periods.monthly.requests, limit: policy.monthlyRequestLimit };
      }
    }

    // 9. 请求自定义周期
    if (policy.customRequestLimit && policy.customRequestResetHours && usage.periods.custom) {
      const resetMs = policy.customRequestResetHours * 3600 * 1000;
      if (now - usage.periods.custom.periodStart < resetMs && usage.periods.custom.requests >= policy.customRequestLimit) {
        return { error: 'REQUEST_QUOTA_EXCEEDED', message: '请求次数配额已用尽', httpStatus: 429, dimension: 'customRequestLimit', usage: usage.periods.custom.requests, limit: policy.customRequestLimit };
      }
    }

    // 10. RPM 检查
    if (policy.rpmLimit) {
      const counter = this.getRpmCounter(keyId);
      this.cleanExpiredTimestamps(counter, now);
      if (counter.timestamps.length >= policy.rpmLimit) {
        return { error: 'RPM_LIMIT_EXCEEDED', message: `每分钟请求数超过限制 (${policy.rpmLimit})`, httpStatus: 429, dimension: 'rpmLimit', usage: counter.timestamps.length, limit: policy.rpmLimit };
      }
    }

    // 11. 并发检查
    if (policy.concurrentLimit) {
      const current = this.concurrentTracker.get(keyId) || 0;
      if (current >= policy.concurrentLimit) {
        return { error: 'CONCURRENT_LIMIT_EXCEEDED', message: `并发请求数超过限制 (${policy.concurrentLimit})`, httpStatus: 429, dimension: 'concurrentLimit', usage: current, limit: policy.concurrentLimit };
      }
    }

    return null; // 所有检查通过
  }

  /** 请求开始：增加并发计数 + RPM 计数 */
  onRequestStart(keyId: string, policy: Policy): void {
    // 并发 +1
    const current = this.concurrentTracker.get(keyId) || 0;
    this.concurrentTracker.set(keyId, current + 1);

    // RPM +1
    if (policy.rpmLimit) {
      const counter = this.getRpmCounter(keyId);
      counter.timestamps.push(Date.now());
    }
  }

  /** 请求结束：减少并发计数 */
  onRequestEnd(keyId: string): void {
    const current = this.concurrentTracker.get(keyId) || 0;
    this.concurrentTracker.set(keyId, Math.max(0, current - 1));
  }

  /** 获取当前并发数 */
  getConcurrentCount(keyId: string): number {
    return this.concurrentTracker.get(keyId) || 0;
  }

  /** 获取当前 RPM */
  getCurrentRpm(keyId: string): number {
    const counter = this.rpmTracker.get(keyId);
    if (!counter) return 0;
    this.cleanExpiredTimestamps(counter, Date.now());
    return counter.timestamps.length;
  }

  // ---- helpers ----

  private getRpmCounter(keyId: string): SlidingWindowCounter {
    let counter = this.rpmTracker.get(keyId);
    if (!counter) {
      counter = { timestamps: [] };
      this.rpmTracker.set(keyId, counter);
    }
    return counter;
  }

  private cleanExpiredTimestamps(counter: SlidingWindowCounter, now: number): void {
    const windowMs = 60_000; // 60 seconds
    counter.timestamps = counter.timestamps.filter(t => now - t < windowMs);
  }

  private isPeriodExpired(periodStart: number, type: 'daily' | 'weekly' | 'monthly'): boolean {
    const now = new Date();

    switch (type) {
      case 'daily': {
        // UTC 00:00 重置
        const todayStart = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
        return periodStart < todayStart;
      }
      case 'weekly': {
        // 周一 UTC 00:00 重置
        const day = now.getUTCDay();
        const mondayOffset = day === 0 ? 6 : day - 1;
        const mondayStart = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - mondayOffset);
        return periodStart < mondayStart;
      }
      case 'monthly': {
        // 每月 1 日 UTC 00:00 重置
        const monthStart = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1);
        return periodStart < monthStart;
      }
    }
  }

  /** 模型名匹配（支持前缀匹配） */
  private matchModel(pattern: string, model: string): boolean {
    if (pattern === model) return true;
    // 支持前缀匹配，如 "claude-sonnet" 匹配 "claude-sonnet-4-20250514"
    if (model.startsWith(pattern)) return true;
    return false;
  }
}

export interface QuotaCheckResult {
  error: string;
  message: string;
  httpStatus: number;
  dimension?: string;
  usage?: number;
  limit?: number;
}
