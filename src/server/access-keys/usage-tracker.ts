/**
 * Key 级用量追踪器
 * 负责用量的持久化、周期重置、历史记录
 */
import path from 'path';
import fs from 'fs/promises';
import type { KeyUsage, KeyUsagePeriod, KeyUsageDailyRecord, TokenUsage } from '../../types';

export class UsageTracker {
  private dataPath: string;
  /** 内存缓存 keyId → KeyUsage */
  private cache: Map<string, KeyUsage> = new Map();
  /** 脏数据标记 */
  private dirty: Set<string> = new Set();
  /** debounce 写入定时器 */
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly FLUSH_INTERVAL = 5000; // 5 秒

  constructor(dataPath: string) {
    this.dataPath = dataPath;
  }

  /** 初始化，确保目录存在 */
  async initialize(): Promise<void> {
    const usageDir = path.join(this.dataPath, 'key-usage');
    await fs.mkdir(usageDir, { recursive: true });
  }

  /** 获取 KeyUsage（优先从缓存读取） */
  async getUsage(keyId: string): Promise<KeyUsage> {
    if (this.cache.has(keyId)) {
      return this.cache.get(keyId)!;
    }

    const usage = await this.loadUsageFile(keyId);
    this.cache.set(keyId, usage);
    return usage;
  }

  /** 记录一次请求的 Token 消耗 */
  async recordTokenUsage(keyId: string, tokenUsage: TokenUsage): Promise<void> {
    const usage = await this.getUsage(keyId);
    const now = Date.now();
    const totalTokens = tokenUsage.totalTokens || (tokenUsage.inputTokens + tokenUsage.outputTokens);

    // 更新 lifetime
    usage.lifetime.totalTokens += totalTokens;
    usage.lifetime.inputTokens += tokenUsage.inputTokens;
    usage.lifetime.outputTokens += tokenUsage.outputTokens;
    usage.lifetime.totalRequests += 1;

    // 更新周期用量（自动检测重置）
    this.updatePeriodTokens(usage.periods.daily, now, 'daily', totalTokens);
    this.updatePeriodTokens(usage.periods.weekly, now, 'weekly', totalTokens);
    this.updatePeriodTokens(usage.periods.monthly, now, 'monthly', totalTokens);
    if (usage.periods.custom) {
      this.updatePeriodTokens(usage.periods.custom, now, 'custom', totalTokens);
    }

    // 更新日历史
    this.updateDailyHistory(usage, now, totalTokens, 0);

    // 标记脏数据
    this.markDirty(keyId);
  }

  /** 记录一次请求（仅计数，无 Token） */
  async recordRequest(keyId: string): Promise<void> {
    const usage = await this.getUsage(keyId);
    const now = Date.now();

    // 更新周期请求计数
    this.updatePeriodRequests(usage.periods.daily, now, 'daily');
    this.updatePeriodRequests(usage.periods.weekly, now, 'weekly');
    this.updatePeriodRequests(usage.periods.monthly, now, 'monthly');
    if (usage.periods.custom) {
      this.updatePeriodRequests(usage.periods.custom, now, 'custom');
    }

    this.markDirty(keyId);
  }

  /** 记录错误 */
  async recordError(keyId: string): Promise<void> {
    const usage = await this.getUsage(keyId);
    usage.lifetime.errorCount += 1;

    const now = Date.now();
    const today = this.formatDate(now);
    const record = usage.dailyHistory.find(h => h.date === today);
    if (record) {
      record.errors += 1;
    }

    this.markDirty(keyId);
  }

  /** 获取用量趋势 */
  async getTrend(keyId: string, days: number = 30): Promise<KeyUsageDailyRecord[]> {
    const usage = await this.getUsage(keyId);
    return usage.dailyHistory.slice(-days);
  }

  /** 刷新脏数据到磁盘 */
  async flush(): Promise<void> {
    if (this.dirty.size === 0) return;

    const keys = Array.from(this.dirty);
    this.dirty.clear();

    await Promise.all(keys.map(keyId => this.saveUsageFile(keyId)));
  }

  /** 定时刷新 */
  startAutoFlush(): void {
    this.flushTimer = setInterval(() => {
      this.flush().catch(err => console.error('[UsageTracker] Auto flush error:', err));
    }, this.FLUSH_INTERVAL);
  }

  /** 停止自动刷新 */
  stopAutoFlush(): void {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
  }

  // ---- helpers ----

  private async loadUsageFile(keyId: string): Promise<KeyUsage> {
    const filePath = this.getUsageFilePath(keyId);
    try {
      const data = await fs.readFile(filePath, 'utf-8');
      return JSON.parse(data);
    } catch {
      return this.createEmptyUsage(keyId);
    }
  }

  private async saveUsageFile(keyId: string): Promise<void> {
    const usage = this.cache.get(keyId);
    if (!usage) return;

    const filePath = this.getUsageFilePath(keyId);
    const dir = path.dirname(filePath);
    await fs.mkdir(dir, { recursive: true });

    // 原子写入
    const tmpPath = filePath + '.tmp';
    await fs.writeFile(tmpPath, JSON.stringify(usage, null, 2), 'utf-8');
    await fs.rename(tmpPath, filePath);
  }

  private getUsageFilePath(keyId: string): string {
    return path.join(this.dataPath, 'key-usage', `${keyId}.json`);
  }

  private createEmptyUsage(keyId: string): KeyUsage {
    const now = Date.now();
    return {
      keyId,
      lifetime: { totalTokens: 0, inputTokens: 0, outputTokens: 0, totalRequests: 0, errorCount: 0 },
      periods: {
        daily: { tokens: 0, requests: 0, periodStart: now },
        weekly: { tokens: 0, requests: 0, periodStart: now },
        monthly: { tokens: 0, requests: 0, periodStart: now },
      },
      dailyHistory: [],
    };
  }

  /** 更新周期 Token（自动检测重置） */
  private updatePeriodTokens(period: KeyUsagePeriod, now: number, type: 'daily' | 'weekly' | 'monthly' | 'custom', tokens: number): void {
    if (this.isPeriodExpired(period.periodStart, now, type)) {
      period.tokens = tokens;
      period.requests = 0;
      period.periodStart = now;
    } else {
      period.tokens += tokens;
    }
  }

  /** 更新周期请求计数（自动检测重置） */
  private updatePeriodRequests(period: KeyUsagePeriod, now: number, type: 'daily' | 'weekly' | 'monthly' | 'custom'): void {
    if (this.isPeriodExpired(period.periodStart, now, type)) {
      period.requests = 1;
      period.tokens = 0;
      period.periodStart = now;
    } else {
      period.requests += 1;
    }
  }

  /** 检查周期是否已过期（需要重置） */
  private isPeriodExpired(periodStart: number, now: number, type: 'daily' | 'weekly' | 'monthly' | 'custom'): boolean {
    switch (type) {
      case 'daily': {
        const d1 = new Date(periodStart);
        const d2 = new Date(now);
        return d1.getUTCFullYear() !== d2.getUTCFullYear() ||
          d1.getUTCMonth() !== d2.getUTCMonth() ||
          d1.getUTCDate() !== d2.getUTCDate();
      }
      case 'weekly': {
        // 简单判断：如果超过 7 天
        return (now - periodStart) > 7 * 24 * 3600 * 1000;
      }
      case 'monthly': {
        const d1 = new Date(periodStart);
        const d2 = new Date(now);
        return d1.getUTCFullYear() !== d2.getUTCFullYear() || d1.getUTCMonth() !== d2.getUTCMonth();
      }
      case 'custom':
        // 自定义周期由外部处理
        return false;
    }
  }

  /** 更新日历史记录 */
  private updateDailyHistory(usage: KeyUsage, now: number, tokens: number, errors: number): void {
    const today = this.formatDate(now);
    const existing = usage.dailyHistory.find(h => h.date === today);
    if (existing) {
      existing.tokens += tokens;
      existing.requests += 1;
      existing.errors += errors;
    } else {
      usage.dailyHistory.push({
        date: today,
        tokens,
        requests: 1,
        errors,
      });
      // 保留最近 90 天
      if (usage.dailyHistory.length > 90) {
        usage.dailyHistory = usage.dailyHistory.slice(-90);
      }
    }
  }

  private formatDate(ts: number): string {
    const d = new Date(ts);
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
  }

  private markDirty(keyId: string): void {
    this.dirty.add(keyId);
  }
}
