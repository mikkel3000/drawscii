> **Note:** This is the original announcement text for [obsidian-asciiflow](https://github.com/xvusrmqj/obsidian-asciiflow) by xvusrmqj, kept for reference. This repository is a fork of it, now named **Drawscii**; see [README.md](README.md).

# 推广文案

## 1. Twitter/X 推文（英文）

---

🚀 Just released ASCIIFlow — a new Obsidian plugin that lets you draw ASCII art diagrams directly in your Markdown notes!

✅ 6 drawing tools (Box, Line, Arrow, Text, Freeform, Select)
✅ Unicode box-drawing characters
✅ Undo/redo, copy/paste, drag-to-move
✅ Light & dark theme support
✅ CJK & IME compatible

📦 Install manually:
1. Download main.js, manifest.json, styles.css from GitHub Releases
2. Create .obsidian/plugins/asciiflow/ in your vault
3. Copy files & enable the plugin

🔗 https://github.com/xvusrmqj/obsidian-asciiflow

#Obsidian #ASCII #Productivity #OpenSource

---

## 2. 小红书帖子（中文）

---

### 标题
🔥 Obsidian 插件推荐｜在笔记里画 ASCII 流程图！

### 正文
最近做了一个 Obsidian 插件——ASCIIFlow，可以直接在 Markdown 笔记里画 ASCII 图形！

✨ 功能亮点：
• 6 种绘图工具：方框、线条、箭头、文本、自由绘制、选择
• 支持 Unicode 制表符，画出来的图超好看
• 撤销/重做、复制/粘贴、拖拽移动
• 自动适配明暗主题
• 支持中文输入法和全角字符

📝 使用方法超简单：
在笔记里写一个 `asciiflow` 代码块，点击 Edit 按钮就能打开可视化编辑器，画完自动保存回笔记。

📦 安装方式：
1. 去 GitHub Releases 下载 main.js、manifest.json、styles.css
2. 在 Obsidian 库中创建 .obsidian/plugins/asciiflow/ 目录
3. 把文件放进去，然后在设置 → 社区插件中启用

🔗 GitHub: https://github.com/xvusrmqj/obsidian-asciiflow

#Obsidian #效率工具 #ASCII #笔记 #知识管理 #插件推荐 #开源

---

## 3. Obsidian Forum 帖子（英文）

---

### Title
[Share] ASCIIFlow — Draw ASCII art diagrams directly in Obsidian code blocks

### Body
Hi everyone! I've just released **ASCIIFlow**, an Obsidian plugin that embeds an interactive ASCII art editor directly into Markdown code blocks.

**What it does:**
Use an `asciiflow` code block in any note, and it renders as an interactive ASCII art canvas with a full-featured visual editor.

**Features:**
- 6 drawing tools: Select, Box, Line, Arrow, Text, Freeform
- Unicode box-drawing characters (┌ ┐ └ ┘ ─ │)
- Lines, L-shaped paths, and arrow connectors
- Text input with IME composition and fullwidth character (CJK) support
- Rectangular selection with copy/cut/paste and drag-to-move
- Undo/redo (up to 100 history states)
- Theme aware — adapts to light and dark themes
- Canvas zoom and pan

**Quick start:**
```
```asciiflow
┌──────────┐     ┌──────────┐
│  Start   │────▶│   End    │
└──────────┘     └──────────┘
```
```

**Install:**
1. Download `main.js`, `manifest.json`, and `styles.css` from the [latest release](https://github.com/xvusrmqj/obsidian-asciiflow/releases)
2. Create the folder `.obsidian/plugins/asciiflow/` in your vault
3. Copy the files into that folder
4. Enable **ASCIIFlow** in Settings → Community Plugins

https://github.com/xvusrmqj/obsidian-asciiflow

Feedback and suggestions are welcome!

---

## 4. 提交 Obsidian 社区插件市场的步骤

### 需要手动操作：

1. 打开 https://github.com/obsidianmd/obsidian-releases
2. 点击右上角 **Fork** 按钮
3. 在你 fork 的仓库中，编辑 `community-plugins.json`
4. 在 JSON 数组末尾添加（注意前一条末尾加逗号）：

```json
{
  "id": "asciiflow",
  "name": "ASCIIFlow",
  "author": "xvusrmqj",
  "description": "Draw ASCII art diagrams directly in Obsidian code blocks with an interactive editor.",
  "repo": "xvusrmqj/obsidian-asciiflow"
}
```

5. 提交更改，标题写 "Add plugin: ASCIIFlow"
6. 创建 Pull Request 到 obsidianmd/obsidian-releases
7. PR 标题: "Add plugin: ASCIIFlow"
8. 填写 PR 描述中的检查项
9. 等待 bot 自动验证（显示 "Ready for review" 标签）
10. 等待 Obsidian 团队审核

### 注意事项：
- 确保 GitHub Release 已上传 `main.js`、`manifest.json`、`styles.css`
- `manifest.json` 中 `id` 不能包含 "obsidian"（已改为 `asciiflow`）
- 描述不超过 250 字符
- 必须有 `LICENSE` 文件（已创建 MIT）
