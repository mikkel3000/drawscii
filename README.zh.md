> **注意：** 本文档描述的是 xvusrmqj 的原始插件 [obsidian-asciiflow](https://github.com/xvusrmqj/obsidian-asciiflow)。本仓库是其分支，现已更名为 **Drawscii**；最新说明请参阅 [README.md](README.md)。
>
> **Note:** This document describes the original [obsidian-asciiflow](https://github.com/xvusrmqj/obsidian-asciiflow) plugin by xvusrmqj. This repository is a fork of it, now named **Drawscii**; see [README.md](README.md) for current instructions.

# Obsidian ASCIIFlow

[English](README.md)

一个 [Obsidian](https://obsidian.md) 插件，在 Markdown 代码块中嵌入 ASCIIFlow 风格的 ASCII 图形编辑器。支持绘制方框、线条、箭头、自由绘制和文本输入，并提供完整的撤销/重做历史。

## 功能特性

- 🖊️ **6 种绘图工具** — 选择、方框、线条、箭头、文本、自由绘制
- 📦 **方框绘制** — 使用 Unicode 制表字符（`┌ ┐ └ ┘ ─ │`）绘制矩形
- 📏 **线条与箭头** — 绘制直线、折线及带箭头的连接线
- ⌨️ **文本输入** — 支持直接键入文字，兼容 IME 输入法和全角字符（CJK）
- ✋ **自由绘制** — 点击或拖拽放置自定义字符
- ✂️ **选择与编辑** — 框选、复制、剪切、粘贴、拖拽移动/复制
- ↩️ **撤销/重做** — 最多 100 步历史记录（Ctrl+Z / Ctrl+Shift+Z）
- 🎨 **主题适配** — 自动适配 Obsidian 明暗主题
- 🔍 **缩放与平移** — 支持画布缩放和平移操作

## 使用方法

在 Obsidian Markdown 文件中，使用 `asciiflow` 代码块：

<pre>
```asciiflow
┌──────────┐
│  Hello   │
│  World   │
└──────────┘
```
</pre>

- **预览模式**：代码块会渲染为 ASCII 图形，点击「Edit」按钮打开编辑器
- **编辑模式**：在 90vw × 90vh 的模态窗口中进行可视化编辑，保存后自动写回代码块

## 工具说明

| 工具 | 快捷操作 | 说明 |
|------|----------|------|
| **选择** | 拖拽框选 | 框选后可复制/剪切/粘贴/删除/拖拽移动 |
| **方框** | 拖拽绘制 | 从一角拖到对角绘制矩形框 |
| **线条** | 拖拽绘制 | 绘制水平线、垂直线或 L 形折线 |
| **箭头** | 拖拽绘制 | 类似线条工具，末端带箭头（`► ◄ ▼ ▲`） |
| **文本** | 点击输入 | 点击放置光标，直接键入文字 |
| **自由绘制** | 点击/拖拽 | 以 `*` 字符进行自由绘制 |

### 键盘快捷键

| 快捷键 | 功能 |
|--------|------|
| `Ctrl+Z` | 撤销 |
| `Ctrl+Shift+Z` | 重做 |
| `Ctrl+C` | 复制选中内容 |
| `Ctrl+X` | 剪切选中内容 |
| `Ctrl+V` | 粘贴 |
| `Escape` | 退出文本输入模式 |

## 安装

### 从 Obsidian 社区插件市场安装（推荐）

1. 打开 Obsidian 设置 → 社区插件
2. 如果开启了**安全模式**，请先关闭
3. 点击**浏览**，搜索 **ASCIIFlow**
4. 点击**安装**，然后**启用**

### 手动安装

1. 下载最新 Release 中的 `main.js`、`manifest.json`、`styles.css`
2. 在 Obsidian 库中创建 `.obsidian/plugins/asciiflow/` 目录
3. 将下载的文件放入该目录
4. 在 Obsidian 设置 → 社区插件中启用 **ASCIIFlow**

### 从源码构建

```bash
# 克隆仓库
git clone https://github.com/xvusrmqj/obsidian-asciiflow.git
cd obsidian-asciiflow

# 安装依赖
npm install

# 开发模式（监听文件变化）
npm run dev

# 生产构建
npm run build
```

## 技术架构

```
src/
├── main.tsx              # 插件入口，注册代码块处理器
├── ui/
│   └── AsciiFlowApp.tsx  # React 主组件（工具栏 + 画布）
├── tools/
│   ├── ITool.ts          # 工具接口定义
│   ├── ToolManager.ts    # 工具管理与事件分发
│   ├── ToolContext.ts     # 工具上下文
│   ├── SelectTool.ts     # 选择工具
│   ├── BoxTool.ts        # 方框工具
│   ├── LineTool.ts       # 线条工具
│   ├── ArrowTool.ts      # 箭头工具
│   ├── TextTool.ts       # 文本工具
│   ├── FreeformTool.ts   # 自由绘制工具
│   └── HistoryManager.ts # 撤销/重做历史管理
├── model/
│   ├── Grid.ts           # 稀疏网格数据模型（Map 实现）
│   ├── Serializer.ts     # 文本 ↔ 网格序列化
│   └── CharWidth.ts      # 全角/半角字符宽度检测
├── renderer/
│   └── CanvasRenderer.ts # Canvas 2D 渲染器
└── input/
    ├── InputHandler.ts   # 指针事件处理
    └── CoordinateMapper.ts # 屏幕 → 网格坐标映射
```

**分层设计**：UI → Tools → Renderer → Model → Input

- **UI 层**：React 组件管理工具栏状态和画布交互
- **Tools 层**：各工具通过 `ToolContext` 修改网格数据，操作后调用 `render()` 刷新
- **Renderer 层**：Canvas 2D API 渲染网格、选区、光标等
- **Model 层**：稀疏网格（`Map<string, string>`），默认 40×120，支持全角字符
- **Input 层**：将屏幕坐标转换为网格坐标，处理缩放和平移

## 技术栈

- **TypeScript**（严格模式）+ **React 18**
- **Canvas 2D API** 渲染
- **esbuild** 构建
- **Obsidian API** ≥ 1.5.0

## 许可证

MIT
