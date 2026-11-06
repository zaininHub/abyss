// v2.0 核心：故事线管理器（Storyline Manager）
import { setStoryline, registerVariants } from './provider.js';
import { clearDynamicRules, _clearRules } from './ruleEngine.js';
import { registerGate, _clearGates } from './gates.js';

let _registered = new Map();
let _current = 'default';
let _unlocked = new Set(['default']);
let _locked = false;

export function registerStoryline(pkg) {
  if (!pkg || !pkg.id) return;
  _registered.set(pkg.id, pkg);
}

export function loadStoryline(id) {
  if (_locked && _current !== id) {
    // console.warn(`[故事线] 单局已锁定，无法切换到 ${id}`);
    return false;
  }
  if (!_registered.has(id)) {
    // console.warn(`未知故事线: ${id}，回退到 default`);
    id = 'default';
  }
  if (_current && _current !== 'default') {
    const prev = _registered.get(_current);
    if (prev && prev.hooks && prev.hooks.onUnload) {
      try { prev.hooks.onUnload(); } catch (e) { /* console.error(e); */ }
    }
  }
  // v3.7.0：只清动态扩展规则。各线声明的 rules 已由 core/lineRules.js 静态注册，
  //   若在此重复注册会让同一变换执行两次（数值翻倍）；若直接 _clearRules() 又会让规则永久丢失。
  clearDynamicRules();
  _clearGates();
  _current = id;
  setStoryline(id);
  const pkg = _registered.get(id);
  if (pkg) {
    if (pkg.data) registerVariants(pkg.data);
    if (pkg.gates) {
      for (const [moduleId, gateDef] of Object.entries(pkg.gates)) {
        registerGate(moduleId, gateDef.predicate, gateDef.label || '', id);
      }
    }
    if (pkg.hooks && pkg.hooks.onLoad) {
      try { pkg.hooks.onLoad(); } catch (e) { /* console.error(e); */ }
    }
  }
  return true;
}

export function switchStoryline(id) {
  if (_locked) {
    // console.warn(`[故事线] 单局已锁定，无法切换`);
    return false;
  }
  return loadStoryline(id);
}

export function getCurrentStoryline() { return _current; }
export function getRegisteredStorylines() { return Array.from(_registered.keys()); }
export function unlockStoryline(id) { _unlocked.add(id); }
export function getUnlockedStorylines() { return Array.from(_unlocked); }
export function lockStorylineSwitch() { _locked = true; }
export function isLocked() { return _locked; }
export function getStorylinePackage(id) { return _registered.get(id); }

// 静态注册故事线。
// 注意：不能使用 import.meta.glob —— 编译产物会残留 import.meta 字面量，
// fileProtocolCompat 插件的安全阀检测到后拒绝把 script 降级为经典加载，
// 导致 file:// 双击打开时应用被浏览器 CORS 策略拦截（v2.0 回归根因）。
import defaultStoryline from '../storylines/default.js';
import abyssStoryline from '../storylines/line_abyss.js';
import faithStoryline from '../storylines/line_faith.js';
import orderStoryline from '../storylines/line_order.js';

[defaultStoryline, abyssStoryline, faithStoryline, orderStoryline].forEach(pkg => {
  if (pkg) registerStoryline(pkg);
});

export function _resetStorylineManager() {
  _registered.clear();
  _current = 'default';
  _unlocked = new Set(['default']);
  _locked = false;
}
