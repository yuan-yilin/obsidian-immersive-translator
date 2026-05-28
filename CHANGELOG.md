# Changelog

## 1.0.9

### Features
- 全文翻译后自动校验 Markdown 格式结构（标题、代码块、表格、引用、YAML frontmatter 等），发现不一致时尝试自动修复并提示用户

### Fixes
- 自动剥离 Claude CLI 可能包裹在译文外层的 ```markdown ``` 代码块，确保写入文件的纯 Markdown 内容与原文格式一致
- 翻译系统 prompt 中新增明确禁止包裹代码块的规则

## 1.0.7

### Fixes
- 阅读模式悬停翻译修复：`selectionchange` 事件在 `mouseup` 后可能检测到选区短暂收起，导致译文到达前 tooltip 被移除。现在翻译进行中不自动隐藏，仅在翻译完成后再响应选区变化。
- 阅读模式悬停翻译修复：leaf 类型检测从仅 `"markdown"` 改为同时搜索 `"markdown"`（编辑模式）和 `"preview"`（阅读模式），确保阅读模式下能正确定位 DOM 容器

## 1.0.6

### Fixes
- 阅读模式悬停翻译：自动隐藏超时从 8s 延长至 60s，避免 Claude CLI 冷启动期间译文被提前移除
- 阅读模式悬停翻译：鼠标在选中文本区域或译文框内移动时保持提示框不消失，移出两者后才关闭
- 全文翻译：改为直接调用 `translateText` 内部分块逻辑，保留 Markdown 段落结构和空行分隔

## 1.0.4

### Features
- 支持阅读模式下的全文翻译：在没有编辑器实例时，通过 vault 读取/写入当前 Markdown 文件
- 支持阅读模式下的悬停翻译：基于 `window.getSelection()` 和 DOM 事件实现浮动译文提示
- 全文翻译命令改为通用 `callback`，兼容编辑模式和阅读模式

### Fixes
- 优化悬停翻译持久化：鼠标停留在译文提示区域内时不会关闭提示

## 1.0.3

### Fixes
- 替换 `@anthropic-ai/claude-agent-sdk` 为直接调用 Claude CLI（`child_process.spawn`），修复 CommonJS 环境下 `import.meta.url` 未定义导致的插件加载崩溃
- 修复插件 manifest id 违反 Obsidian 命名规范的问题（移除 `obsidian-` 前缀）

## 1.0.2

### Features
- 悬停翻译支持缓存机制，相同文本快速返回译文
- 新增全文翻译进度弹窗，支持取消操作

## 1.0.1

### Features
- 支持选中文本翻译、全文翻译（替换/新建文件）、侧边栏翻译
- 支持 Claude CLI 自动检测路径
- 支持分块翻译长文档，保留 Markdown 语法
