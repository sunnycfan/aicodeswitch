/**
 * API URL 规范化工具
 *
 * 解决用户填写的 apiUrl 可能已包含版本路径（如 /v1、/v3、/v4、/v1beta），
 * 而系统又会硬编码拼接版本路径，导致出现双重版本路径的问题。
 *
 * 例如：
 * - https://xxx.com/api/anthropic/v1 + /v1/messages → https://xxx.com/api/anthropic/v1/messages
 * - https://xxx.com/api/anthropic/v4 + /v1/messages → https://xxx.com/api/anthropic/v4/messages
 */

// 匹配末尾的版本路径，如 /v1, /v4, /v1beta, /v2alpha 等
const VERSION_SUFFIX_REGEX = /(\/v\d+[a-z]*)$/;

// 匹配路径开头的版本段，如 /v1/, /v4/, /v1beta/ 等
const VERSION_PREFIX_REGEX = /^\/v\d+[a-z]*\//;

/**
 * 智能构建上游请求 URL
 *
 * 检测 apiUrl 末尾的版本路径，智能处理版本冲突：
 * - 若 apiUrl 无版本后缀：直接拼接 appendPath
 * - 若 apiUrl 有版本后缀：剥离后用该版本替换 appendPath 中的版本段
 *
 * @param apiUrl 用户配置的 API 地址（可能包含末尾版本路径）
 * @param appendPath 需要拼接的路径（如 /v1/messages, /v1/chat/completions）
 * @returns 规范化后的完整 URL
 */
export function buildUpstreamUrl(apiUrl: string, appendPath: string): string {
  // 去除末尾斜杠
  const url = apiUrl.replace(/\/+$/, '');

  // 检测 apiUrl 末尾是否包含版本路径
  const versionMatch = url.match(VERSION_SUFFIX_REGEX);
  if (!versionMatch) {
    // 无版本后缀，直接拼接
    return `${url}${appendPath}`;
  }

  // 剥离版本后缀得到 baseUrl
  const baseUrl = url.slice(0, -versionMatch[1].length);
  const extractedVersion = versionMatch[1]; // 如 '/v4'

  // 将 appendPath 中开头的版本段替换为提取到的版本
  const normalizedPath = appendPath.replace(VERSION_PREFIX_REGEX, `${extractedVersion}/`);

  return `${baseUrl}${normalizedPath}`;
}

/**
 * 规范化 API URL，去除末尾斜杠和版本后缀
 *
 * @param apiUrl 用户配置的 API 地址
 * @returns 去除末尾斜杠和版本路径后的基础 URL
 */
export function normalizeApiUrl(apiUrl: string): string {
  // 去除末尾斜杠
  let url = apiUrl.replace(/\/+$/, '');
  // 去除末尾版本路径
  url = url.replace(VERSION_SUFFIX_REGEX, '');
  return url;
}
