# PlanDeck

面向 macOS 的本地 AI 订阅和模型 Plan 管理器。

PlanDeck 把多个 AI Tool 和供应商配置集中到一个本地界面中，展示 Plan、模型、项目/会话现状，并支持带备份的 Tool 层切换。

> **Beta：** 首个公开版本只支持 Apple Silicon macOS，安装包未签名、未公证。

[English README](README.md)

## 功能

- 展示 Tool -> Project -> Session -> Model 级联视图。
- 统一列出配置文件、环境变量和 OAuth 三类 Plan。
- 通过独立的本地环境文件管理带凭据的订阅 Plan 和账号 Group。
- 将 Tool 当前配置与 Catalog 比对，显示识别状态。
- 预览并切换 Tool 默认 Plan 和模型。
- 写入配置前自动备份。
- 在 Tool 抽屉中查看和恢复历史版本。
- 通过 macOS 菜单栏托盘快速切换。
- 支持跟随系统、浅色和深色主题。
- 查看最近的 GitHub Release 更新记录并安装经签名验证的更新，可选择启动时自动检查。
- 导入兼容的 ccSwitch 供应商历史。

当前支持 Hermes、opencode、OpenClaw、Codex CLI、Claude Code、ZCode 和 Kimi Code。ZCode 和 Kimi Code 在环境 Group 中暂时只识别不写入，直到其凭据契约完成验证。

## 当前限制

这是早期 macOS Beta，不代表生产稳定性承诺。首个版本只支持 Apple Silicon（`aarch64-apple-darwin`）。Windows 和 Linux 尚未支持，部分运行时行为使用 macOS 专用能力。

首个可下载版本未签名、未公证。首次打开时 macOS 可能显示 Gatekeeper 或“无法验证开发者”警告。

## 隐私和凭据

PlanDeck 采用本地优先设计：

- 读取本机支持的 AI Tool 配置文件。
- 只有在确认 Group/Plan 修改、恢复备份、迁移旧凭据或安装环境 loader 时写入文件。
- 没有 PlanDeck 云服务，不会上传配置。
- 订阅凭据保存在 `~/.config/ai-subscriptions/subscriptions.env`，由 Rust 运行时读取并使用限制性权限；前端只接收是否设置和指纹。
- Catalog 只保存 Plan 元数据，不持久化 API key。
- 备份是配置文件副本，应按原配置文件同等保护。

不要把运行时 Catalog、备份、AI Tool 配置或凭据提交到 Git。

## 安装

从 [GitHub Releases](https://github.com/ynotoony/plandeck/releases) 下载最新 `.dmg`。首个 Beta 仅支持 Apple Silicon，且未签名。

未签名版本首次启动可能被 macOS 拦截。确认校验和和发布来源可信后，可在 Finder 中按住 Control 点击应用并选择“打开”，或在“系统设置 -> 隐私与安全性”中允许打开。

安装后可在 PlanDeck 内检查新版本或查看最近的 Release Notes。更新包在安装前使用 PlanDeck 的 Tauri updater 公钥验证；该完整性签名与 Apple Developer ID 签名及公证是两个独立机制。

## 从源码运行

依赖：

- Apple Silicon macOS。
- Node.js `22.23.1`。
- Rust `1.94.0` 和 `aarch64-apple-darwin` target。
- 构建 Tauri macOS bundle 需要完整 Xcode，只有 Command Line Tools 可能不足。

安装依赖并运行前端：

```bash
cd core && npm ci
cd ../app && npm ci
npm run dev
```

运行 Tauri：

```bash
cd app
npm run tauri dev
```

构建 macOS DMG：

```bash
cd app
npm run tauri build -- --target aarch64-apple-darwin --bundles dmg
```

## 测试

Core：

```bash
cd core
npm ci
npm test
npm run typecheck
```

前端：

```bash
cd app
npm ci
npm run typecheck
npm run build
```

Rust：

```bash
cd app/src-tauri
cargo test
cargo clippy --all-targets -- -D warnings
```

E2E 使用临时 HOME 和 mock Tauri backend，运行前需要先构建 debug binary：

```bash
cd app/src-tauri
cargo build
cd ..
npm run e2e
```

开发和测试时可使用 `PLANDECK_HOME`、`PLANDECK_DATA_DIR` 指定隔离目录。

## 文档

- [English README](README.md)
- [架构说明](docs/architecture.md)
- [发布指南](docs/releasing.md)
- [安全政策](SECURITY.md)
- [贡献指南](CONTRIBUTING.md)

## 许可证

PlanDeck 使用 [MIT License](LICENSE)。
