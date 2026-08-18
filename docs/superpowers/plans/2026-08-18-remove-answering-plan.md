# 移除答题功能 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 将仓库收敛为只负责武汉理工网上党校自动刷课的油猴脚本，彻底移除题库、AI答题和答案捕获能力。

**Architecture:** 保留现有主脚本中从状态管理到 `init()` 的课程自动化模块；删除 `init()` 后完整的题库/答题模块，并同步收缩元数据权限。删除独立题库工具与答案数据，更新文档，使仓库单一职责化。

**Tech Stack:** Tampermonkey UserScript、原生 JavaScript、PowerShell、Node.js 语法检查、Git。

---

## 文件映射

- Modify: `C:/Users/FieldLu/wut_assistant/WUT网上党校 全能助手.user.js` — 保留刷课模块，删除答题模块与无用权限/描述。
- Modify: `C:/Users/FieldLu/wut_assistant/README.md` — 文案和功能列表改为刷课版。
- Modify: `C:/Users/FieldLu/wut_assistant/CHANGELOG.md` — 记录刷课版变更。
- Modify: `C:/Users/FieldLu/wut_assistant/.gitignore` — 删除已经不存在的题库密钥专用忽略项。
- Delete: `C:/Users/FieldLu/wut_assistant/武汉理工党校题库提取-0.1.user.js` — 独立题库/答案提取脚本。
- Delete: `C:/Users/FieldLu/wut_assistant/合并上传云端题库.js` — 题库维护工具。
- Delete: `C:/Users/FieldLu/wut_assistant/qbank/` — 题目与答案数据、AI 配置。
- Keep: `C:/Users/FieldLu/wut_assistant/docs/superpowers/specs/2026-08-18-remove-answering-design.md` — 已确认的设计。

### Task 1: 收缩主用户脚本元数据

**Files:**
- Modify: `WUT网上党校 全能助手.user.js:1-24`

- [ ] 更新 `@version` 为 `1.6.0`。
- [ ] 将 `@description` 改为只描述自动学习、视频接管、断点续播、智能跳课、进度看门狗和真人模拟。
- [ ] 移除 `GM_deleteValue`、`GM_xmlhttpRequest` 元数据授权；保留 `GM_setValue`、`GM_getValue`。
- [ ] 移除 AI 服务相关的 `@connect`，保留课程脚本仍可能需要的 Gitee/Giteeusercontent 声明仅在源码还有使用时保留；若源码无使用则一并移除。

### Task 2: 删除主脚本答题模块

**Files:**
- Modify: `WUT网上党校 全能助手.user.js:1414-3130`

- [ ] 保留前面的课程状态、面板、视频接管、课程循环、真人模拟、进度监控和 `init()`。
- [ ] 删除 `// ==================== 题库模块 ====================` 之后的所有题库/答题实现，包括本地题库、Gitee 云端同步、AI Provider、答案查询、答案填充/提交、自动答题、题目扫描和 XHR/Fetch 拦截器。
- [ ] 重新以一个闭合的 `})();` 结束脚本，确保 IIFE 和初始化逻辑语法完整。
- [ ] 使用 `rg` 检查主脚本不再包含 `答题`、`题库`、`answer`、`question`、`AI Provider`、`saveData`、AI API 域名等答题实现痕迹；允许课程日志中的普通“完成/进度”词汇存在。

### Task 3: 清理仓库答题配套文件

**Files:**
- Delete: `武汉理工党校题库提取-0.1.user.js`
- Delete: `合并上传云端题库.js`
- Delete: `qbank/ai-config.json`
- Delete: `qbank/dangshi.json`
- Delete: `qbank/index.json`
- Delete: `qbank/qbank.json`
- Delete: `qbank/sizheng.json`

- [ ] 删除上述文件和目录。
- [ ] 使用 `rg` 检查仓库不再残留题库 JSON、AI 配置、题目提取脚本和答案上传脚本。

### Task 4: 更新项目文档

**Files:**
- Modify: `README.md`
- Modify: `CHANGELOG.md`

- [ ] README 标题和简介明确这是“全自动刷课脚本”，不再宣传题库或 AI 答题。
- [ ] README 功能列表只保留刷课功能，并说明脚本打开培训班页面后自动运行。
- [ ] README 安装链接继续指向保留的主用户脚本。
- [ ] CHANGELOG 增加 `1.6.0 (2026-08-18)` 条目，记录移除题库/AI/自动答题/答案捕获并保留刷课功能。
- [ ] `.gitignore` 删除失效的 `qbank/ai-config.json` 条目。

### Task 5: 静态验证与回归检查

**Files:**
- Verify: all changed files

- [ ] 运行 Node.js 语法检查。由于用户脚本包含 metadata 注释，使用 PowerShell 提取首个 IIFE 内容到临时 `.js` 文件，再执行 `node --check`。
- [ ] 检查主脚本关键课程函数仍存在：`scanAndStart`、`enterNextCourse`、`hackVideo`、`progressWatchdog`、`startHumanSimulator`、`installProgressMonitor`、`init`。
- [ ] 检查答题关键标识已不存在：`queryAI`、`doAutoAnswer`、`fillAnswers`、`submitAnswers`、`saveToDB`、`extractQuestionsFromData`、`saveData`；允许课程进度监控继续使用 `window.fetch`/`XMLHttpRequest`。
- [ ] 检查仓库文件列表中只保留刷课脚本、文档和设计/计划文件。
- [ ] 查看 `git diff --check`，确保没有空白错误。
- [ ] 运行 `git diff --stat` 与 `git status --short`，记录最终变更范围。

### Task 6: 代码审查

- [ ] 获取修改前后的 Git 状态和 diff。
- [ ] 使用 `code-reviewer` 子代理检查：答题逻辑是否彻底删除、课程逻辑是否误删、Tampermonkey 权限是否最小化、文档是否一致、验证是否充分。
- [ ] 若发现严重或重要问题，先修复，再重新执行静态验证。
