/**
 * AccessKey 解析器
 * 在代理请求入口处解析 sk_ Key，返回 AccessKey + Policy 信息
 */
import type { AccessKey, Policy } from '../../types';
import { AccessKeyManager } from './manager';
import { PolicyManager } from './policy-manager';

export interface KeyResolveResult {
  accessKey: AccessKey;
  policy: Policy;
}

export class KeyResolver {
  private keyManager: AccessKeyManager;
  private policyManager: PolicyManager;

  constructor(keyManager: AccessKeyManager, policyManager: PolicyManager) {
    this.keyManager = keyManager;
    this.policyManager = policyManager;
  }

  /**
   * 尝试解析请求中的 API Key
   * @returns 如果是 sk_ 开头的 Key，尝试解析；否则返回 null（走现有流程）
   */
  resolve(apiKeyValue: string): KeyResolveResult | { error: KeyResolveError } {
    if (!apiKeyValue.startsWith('sk_')) {
      return null as any; // 不是 AccessKey，走现有流程
    }

    // 查找 AccessKey
    const accessKey = this.keyManager.findByApiKey(apiKeyValue);
    if (!accessKey) {
      return { error: { type: 'authentication_error', code: 'INVALID_API_KEY', message: '无效的 API Key', httpStatus: 401 } };
    }

    // 状态检查
    if (accessKey.status !== 'active') {
      return { error: { type: 'permission_error', code: 'KEY_DISABLED', message: '密钥已停用', httpStatus: 403 } };
    }

    // 策略检查
    if (!accessKey.policyId) {
      return { error: { type: 'permission_error', code: 'NO_POLICY_CONFIGURED', message: '密钥未配置策略', httpStatus: 403 } };
    }

    const policy = this.policyManager.get(accessKey.policyId);
    if (!policy) {
      return { error: { type: 'permission_error', code: 'POLICY_NOT_FOUND', message: '策略不存在', httpStatus: 403 } };
    }

    // 更新最后活跃时间
    this.keyManager.updateLastActive(accessKey.id);

    return { accessKey, policy };
  }
}

export interface KeyResolveError {
  type: 'authentication_error' | 'permission_error';
  code: string;
  message: string;
  httpStatus: number;
}
