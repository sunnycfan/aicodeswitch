/**
 * 版本号同步脚本
 *
 * 以 package.json 的 version 为唯一真相源，在 Tauri 构建前同步到：
 *   - tauri/tauri.conf.json  顶层 version（决定安装包产品版本号）
 *   - tauri/Cargo.toml       [package] version（决定 Rust crate 版本）
 *
 * 触发方式：
 *   - 自动：tauri:build 时由 prepare-resources.js 调用（先于 cargo 编译，版本号及时生效）
 *   - 手动：npm run version:sync
 *
 * 设计要点：
 *   - 使用正则精确替换 version 字段，不重新序列化整个文件，避免格式 / git diff 噪音；
 *   - 仅当目标值与当前值不一致时才写入；
 *   - Cargo.toml 只匹配行首的 version = "..."，避免误伤依赖项里的 { version = "x" }。
 */
const fs = require('fs');
const path = require('path');

const tauriDir = __dirname;
const repoRoot = path.resolve(tauriDir, '..');
const pkgPath = path.join(repoRoot, 'package.json');
const tauriConfPath = path.join(tauriDir, 'tauri.conf.json');
const cargoPath = path.join(tauriDir, 'Cargo.toml');

const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
const version = pkg.version;

if (!version) {
  console.error('[sync-version] 无法从 package.json 读取 version，终止');
  process.exit(1);
}

let changed = false;

// 1) tauri.conf.json：顶层 version 是文件中唯一的 "version" 字段
const tauriConf = fs.readFileSync(tauriConfPath, 'utf-8');
const tauriConfNext = tauriConf.replace(
  /("version"\s*:\s*")([^"]+)(")/,
  `$1${version}$3`
);
if (tauriConfNext !== tauriConf) {
  fs.writeFileSync(tauriConfPath, tauriConfNext, 'utf-8');
  console.log(`[sync-version] tauri.conf.json -> ${version}`);
  changed = true;
}

// 2) Cargo.toml：仅匹配行首的 version = "..."（[package] 段下），依赖项里的 { version = "x" } 不受影响
const cargo = fs.readFileSync(cargoPath, 'utf-8');
const cargoNext = cargo.replace(
  /(^[ \t]*version\s*=\s*")([^"]+)(")/m,
  `$1${version}$3`
);
if (cargoNext !== cargo) {
  fs.writeFileSync(cargoPath, cargoNext, 'utf-8');
  console.log(`[sync-version] Cargo.toml -> ${version}`);
  changed = true;
}

if (!changed) {
  console.log(`[sync-version] already up to date (${version})`);
}
