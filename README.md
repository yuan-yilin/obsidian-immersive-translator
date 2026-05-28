# Obsidian Immersive Translator

An Obsidian desktop plugin that translates selected text, full notes, and sidebar input through the local Claude CLI.

## Features

- Translate selected editor text from the command palette or editor context menu.
- Translate the current note and either replace it or create a translated copy.
- Open a translation sidebar with source/target language selectors and streaming output.
- Optional selected-text hover translation with conservative limits.
- Markdown-aware prompts that preserve code blocks, links, frontmatter, Obsidian wiki links, callouts, tables, task lists, and math.

## Requirements

- Obsidian desktop app.
- Claude CLI installed and authenticated locally.
- Node.js/npm for building the plugin.

## Build

```bash
npm install
npm run build
```

The build emits `main.js`. Install `main.js`, `manifest.json`, and `styles.css` into your vault's `.obsidian/plugins/immersive-translator/` directory.

## Usage

1. Enable the plugin in Obsidian.
2. Open plugin settings.
3. Use "检测 CLI 路径" or manually set the Claude CLI path.
4. Use "测试 Claude CLI" to verify translation works.
5. Use the command palette, editor right-click menu, or ribbon/sidebar to translate content.
