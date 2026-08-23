const fs = require('fs');
const path = require('path');
const toml = require('@iarna/toml');

/**
 * 自愈历史 bug 造成的数字键对象
 * 旧版 deepSet 曾把数组序列化成 `[notify] 0=.. 1=..` 形式的数字键 table，
 * 且 parse→merge→stringify 链路会原样保留该坏结构。
 * 这里在解析后把「键全为从 0 开始的连续整数」的对象还原为数组。
 */
const healNumericKeyedObjects = (value) => {
  if (Array.isArray(value)) {
    return value.map(healNumericKeyedObjects);
  }
  if (value === null || typeof value !== 'object') {
    return value;
  }

  const keys = Object.keys(value);
  const healed = {};
  let healedChanged = false;
  for (const key of keys) {
    const healedValue = healNumericKeyedObjects(value[key]);
    healed[key] = healedValue;
    if (healedValue !== value[key]) {
      healedChanged = true;
    }
  }

  // 空对象或包含非数字/不连续键的对象不是历史坏结构，保持原样
  if (keys.length === 0) {
    return healed;
  }
  const indices = keys.map((key) => Number(key));
  if (indices.some((num, idx) => !Number.isInteger(num) || num !== idx)) {
    return healedChanged ? healed : value;
  }

  // 键为 0..n-1 连续整数 → 还原为数组
  return indices.map((idx) => healed[String(idx)]);
};

/**
 * TOML 解析器
 */
const parseToml = (content) => {
  try {
    return healNumericKeyedObjects(toml.parse(content));
  } catch (error) {
    throw new Error(`Failed to parse TOML: ${error.message}`);
  }
};

/**
 * TOML 序列化器
 */
const stringifyToml = (obj) => {
  try {
    return toml.stringify(obj);
  } catch (error) {
    throw new Error(`Failed to stringify TOML: ${error.message}`);
  }
};

/**
 * 深拷贝
 */
const deepClone = (value) => JSON.parse(JSON.stringify(value));

/**
 * 判断字段路径是否被管理（支持前缀匹配）
 */
const isManagedPath = (fieldPath, managedFields) => {
  return managedFields.some((managedField) => {
    const managedPath = managedField.split('.');
    if (fieldPath.length < managedPath.length) {
      return false;
    }

    for (let i = 0; i < managedPath.length; i += 1) {
      if (String(fieldPath[i]) !== managedPath[i]) {
        return false;
      }
    }
    return true;
  });
};

/**
 * 深度获取对象值
 */
const deepGet = (obj, fieldPath) => {
  let current = obj;
  for (const segment of fieldPath) {
    if (current === undefined || current === null) {
      return undefined;
    }
    current = current[segment];
  }
  return current;
};

/**
 * 深度设置对象值
 */
const deepSet = (obj, fieldPath, value) => {
  let current = obj;
  for (let i = 0; i < fieldPath.length - 1; i += 1) {
    const key = fieldPath[i];
    if (current[key] === undefined || current[key] === null || typeof current[key] !== 'object') {
      // 下一级路径为数字索引时创建数组，否则创建对象（正确还原数组结构）
      current[key] = typeof fieldPath[i + 1] === 'number' ? [] : {};
    }
    current = current[key];
  }
  current[fieldPath[fieldPath.length - 1]] = value;
};

/**
 * 收集所有叶子字段路径（数组视为叶子）
 */
const collectPaths = (obj, currentPath = [], allPaths = []) => {
  if (obj === null || obj === undefined) {
    if (currentPath.length > 0) {
      allPaths.push(currentPath);
    }
    return allPaths;
  }

  if (Array.isArray(obj)) {
    if (currentPath.length > 0) {
      allPaths.push(currentPath);
    }
    return allPaths;
  }

  if (typeof obj !== 'object') {
    if (currentPath.length > 0) {
      allPaths.push(currentPath);
    }
    return allPaths;
  }

  const keys = Object.keys(obj);
  if (keys.length === 0) {
    if (currentPath.length > 0) {
      allPaths.push(currentPath);
    }
    return allPaths;
  }

  for (const key of keys) {
    collectPaths(obj[key], [...currentPath, key], allPaths);
  }

  return allPaths;
};

/**
 * JSON 合并函数
 * 以 source 为基础，合并 other 中的非管理字段
 */
const mergeJsonSettings = (source, other, managedFields) => {
  const result = deepClone(source);
  const allPaths = collectPaths(other);

  for (const fieldPath of allPaths) {
    if (isManagedPath(fieldPath, managedFields)) {
      continue;
    }

    const value = deepGet(other, fieldPath);
    if (value !== undefined) {
      deepSet(result, fieldPath, deepClone(value));
    }
  }

  return result;
};

/**
 * TOML 合并函数
 * 以 source 为基础，合并 other 中的非管理字段
 */
const mergeTomlSettings = (source, other, managedFields) => {
  const result = deepClone(source);
  const allPaths = collectPaths(other);

  for (const fieldPath of allPaths) {
    if (isManagedPath(fieldPath, managedFields)) {
      continue;
    }

    const value = deepGet(other, fieldPath);
    if (value !== undefined) {
      deepSet(result, fieldPath, deepClone(value));
    }
  }

  return result;
};

/**
 * 原子性写入函数
 * 先写入临时文件，然后原子性重命名
 */
const atomicWriteFile = (filePath, content) => {
  const tempFile = path.join(path.dirname(filePath), `.tmp_${path.basename(filePath)}`);

  try {
    // 确保目录存在
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    // 写入临时文件
    fs.writeFileSync(tempFile, content, 'utf-8');

    // 原子性重命名
    fs.renameSync(tempFile, filePath);
  } catch (error) {
    // 清理临时文件
    if (fs.existsSync(tempFile)) {
      fs.unlinkSync(tempFile);
    }
    throw error;
  }
};

module.exports = {
  parseToml,
  stringifyToml,
  mergeJsonSettings,
  mergeTomlSettings,
  atomicWriteFile,
};
