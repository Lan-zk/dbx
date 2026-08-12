# AGENTS.md

本文件为 AI 编程助手提供 DBX 仓库的上下文。内容综合自 `README.zh-CN.md`、`CONTRIBUTING.zh-CN.md` 与本地开发启动流程，命令均为跨平台（macOS / Linux / Windows 通用）。

---

## 1. 项目概览

DBX 是一个约 20 MB 的开源数据库管理工具，单一代码库支持 70+ 种数据库，形态覆盖桌面端、Docker、Web、CLI 与 MCP Server。无需 Java / Python 运行时，不内嵌 Chromium。

**技术栈**

| 层级 | 技术 |
| --- | --- |
| 桌面框架 | Tauri 2 |
| 前端 | Vue 3 + TypeScript |
| UI | shadcn-vue + Tailwind CSS |
| 编辑器 | CodeMirror 6 |
| 后端 | Rust（sqlx / tiberius / redis-rs / mongodb 等） |
| JDBC 驱动 | Java + Gradle（`agents/`） |

---

## 2. 仓库结构

| 路径 | 说明 |
| --- | --- |
| `apps/desktop/src/` | Vue 3 桌面前端 |
| `src-tauri/` | Tauri 桌面端壳层与命令层（Rust） |
| `crates/dbx-core/` | 共享 Rust 核心逻辑：驱动、schema/查询、导入导出、迁移、插件 |
| `crates/dbx-web/` | Docker / Web HTTP 后端二进制（`dbx-web`） |
| `crates/dbx-mcp/` | MCP Server 核心（Rust） |
| `crates/dbx-cli/` | CLI 核心（Rust） |
| `packages/cli/` | `@dbx-app/cli`（npm 包，平台二进制在 `packages/cli-*`） |
| `packages/mcp-server/` | `@dbx-app/mcp-server`（npm 包，平台二进制在 `packages/mcp-*`） |
| `packages/mongo-shell/` | 桌面端内部 MongoDB 编辑器解析工具（TS） |
| `packages/app-tests/`、`packages/test-globals.ts` | 前端测试辅助 |
| `agents/` | JDBC Agent 驱动工程（Java / Gradle） |
| `docs/` | 官网文档站（Next.js）与文档内容 |
| `examples/` | 配置与自动化示例（CLI、MCP、Docker、API） |
| `deploy/` | Dockerfile、Compose、数据库测试配方、Homebrew 等 |
| `tests/fixtures/` | 测试夹具 |
| `vendor/` | 被 `[patch.crates-io]` 固定的上游 crate fork（兼容性补丁） |

Rust workspace 成员（见根 `Cargo.toml`）：`src-tauri`、`crates/dbx-core`、`crates/dbx-web`、`crates/dbx-mcp`、`crates/dbx-cli`。pnpm workspace：`packages/*`。

---

## 3. 环境要求

| 依赖 | 版本 | 说明 |
| --- | --- | --- |
| Node.js | >= 22.13.0（`.nvmrc` 锁定 22.13.0） | |
| pnpm | 10.27.0（`packageManager` 字段锁定） | 建议用 corepack 启用 |
| Rust | >= 1.88 | |
| Make | 任意现代版本 | 所有开发入口都走 `make` |
| JDK 21 | 仅 `agents/` JDBC 驱动构建/测试需要 | 环境允许时 Gradle 可自动下载 toolchain |
| Docker | 仅 `make db*` 数据库测试环境需要 | |

**系统依赖**

- **macOS**：无需额外安装。
- **Linux（Ubuntu/Debian）**：`sudo apt-get install -y libwebkit2gtk-4.1-dev libgtk-3-dev libappindicator3-dev librsvg2-dev patchelf libssl-dev`
- **NIXOS/Nix**：见 `README-NIX.md`。

---

## 4. 常用命令

所有开发入口均通过根目录 `Makefile`，默认目标 `make` = `make dev`。

### 开发

```bash
make              # 完整 Tauri 桌面端开发环境（默认目标 dev）
make dev-fast     # 轻量 Tauri 开发：--no-default-features --features duckdb-sidecar
make dev-web      # 仅前端 Vite（端口 5173，mode=web）
make dev-backend  # 仅 Web 后端（node scripts/dev-backend.mjs）
```

`make` / `make dev*` 会在需要时先执行 `pnpm install --frozen-lockfile`（Makefile 以 `node_modules/.modules.yaml` 为前置），然后启动。Tauri 模式下 Vite 服务于 `TAURI_DEV_PORT`（默认 **1420**），`tauri dev` 随后 `cargo run` 并从该端口加载前端。

> 开发版可与已安装的 DBX 同时运行并共享本地连接与历史。避免在两个窗口同时修改同一连接或全局设置。

### 构建

```bash
make build    # 前端类型检查 + Vite 构建（pnpm build:checked）
make package  # 桌面端安装包（pnpm tauri build），产物在 src-tauri/target/release/bundle/
make clean    # cargo clean
```

### 检查与测试

```bash
make check             # 前端全量：oxfmt --check + oxlint + vue-tsc + vitest run
make test              # vitest run
make cargo-check-fast  # cargo check --no-default-features（最快 Rust 检查）
make cargo-test-fast   # cargo test --no-default-features
```

前端单测/格式化：

```bash
pnpm test       # vitest run
pnpm lint       # oxlint --vue-plugin apps/desktop/src
pnpm fmt        # oxfmt 自动格式化 apps/desktop/src/**/*.{ts,vue}
pnpm typecheck  # vue-tsc --noEmit
```

npm 包（CLI / MCP Server）：

```bash
pnpm build:packages   # 构建 @dbx-app/cli + @dbx-app/mcp-server
pnpm test:packages    # 测试上述两个包
```

JDBC Agent 驱动（需 JDK 21）：

```bash
cd agents && ./gradlew test
```

### 文档站

```bash
make docs        # 本地预览文档站（Next.js，127.0.0.1）
make docs-build  # 构建文档站并生成 sitemap
make docs-install # 单独安装文档站依赖
```

### 数据库测试环境（需 Docker）

```bash
make db-list                  # 列出可用数据库版本
make db DB=mysql@8.4          # 启动并打印 DBX 连接字段
make db-verify DB=mysql@8.4   # 启动并跑冒烟检查
make db-down DB=mysql@8.4     # 停止
make db-reset DB=mysql@8.4 CONFIRM=1  # 删除容器与数据
make db-check                 # 校验所有配方与 Compose 文件
```

配方在 `deploy/database/`。

---

## 5. 架构与构建要点

### 默认特性

`src-tauri` 与 `crates/dbx-core` 的默认特性均为：

```
duckdb-sidecar, mq-admin, sqlite-sqlcipher, system-fonts
```

- `make dev-fast` 用 `--no-default-features --features duckdb-sidecar` 关闭其余默认特性（含 `sqlite-sqlcipher`，它需 vendored OpenSSL + sqlcipher C 编译，较重），适合快速迭代。
- `make cargo-check-fast` / `make cargo-test-fast` 用 `--no-default-features`（不带任何特性），最快。
- 发布构建（`pnpm tauri build` / `make package`）始终包含全部默认特性。

### Cargo 依赖特殊性

根 `Cargo.toml` 的 `[patch.crates-io]` 固定了若干上游 fork：

- **vendored 本地 fork**（`vendor/` 下）：`ctor`、`rumqttc`、`dirs-sys`、`pageant`、`wry` —— 兼容性补丁。
- **git 依赖**：`tokio-postgres` / `postgres-types` / `postgres-protocol`（来自 `t8y2/tokio-postgres-gaussdb` fork）、`mysql_async`（来自 `t8y2/mysql_async` fork）。

> **首次构建需要联网**拉取上述 git 依赖与 crates.io 索引/源码；后续缓存在 `~/.cargo`（`git/` 与 `registry/`），增量构建很快。

### 前端构建链

- Vite 8 + `@vitejs/plugin-vue`，配置在 `apps/desktop/vite.config.ts`。
- `pnpm dev:tauri` = `tauri dev`；`pnpm dev:web` 在端口 5173、`mode=web`。
- `apps/desktop/vitePublicBasePathRedirect.ts` 用于子路径部署（`DBX_PUBLIC_BASE_PATH` / `VITE_DBX_BASE_PATH`）。

### 部署形态

- 桌面端：Tauri 2，跨 macOS / Windows / Linux。
- Docker / Web：`crates/dbx-web` 编译为 `dbx-web`，镜像 `t8y2/dbx`，默认端口 4224，数据卷 `/app/data`。源码构建用 `deploy/docker-compose.yml`，发布镜像用 `deploy/docker-compose.release.yml`。

---

## 6. 开发约定

### 分支与提交

- 分支名简短明确：`docs/web-api-reference`、`fix/mysql-connection-timeout`、`feat/redis-key-search`。
- 一个 PR 只做一类事；修 Bug 时不要顺手大重构（除非重构是修复所必需）。
- 提交信息用自然语言写清楚：`docs: add web API reference`、`fix(redis): handle empty scan cursor`、`feat(schema): show catalog info for Doris`。

### 格式化（pre-commit 自动执行）

Husky `pre-commit` 钩子会：

1. `lint-staged` 对暂存的 `apps/desktop/src/**/*.{ts,vue}` 跑 `oxfmt`；
2. 对暂存的 `.rs`（`src-tauri`、`crates/dbx-core`、`crates/dbx-web`）跑 `cargo fmt` 并重新 `git add`。

配置：

- 前端：`.oxfmtrc.json`（**printWidth 300**，刻意宽，勿改窄）；`oxlint` 配 Vue 插件。
- Rust：`rustfmt.toml`（edition 2021、max_width 120、use_small_heuristics Max）；`clippy.toml`（too-many-arguments-threshold = 10）。

`make check` 跑的是格式**检查**（`oxfmt --check`），不自动修；格式不符时先 `pnpm fmt` / `cargo fmt`。

### 测试

按改动范围跑对应检查：

```bash
make cargo-check-fast   # 改了 Rust
make cargo-test-fast
pnpm test               # 改了前端或某 package
```

改的是前端或某个 package 时，再补跑对应目录下的测试。

### 文档

- 仓库内文档：`README.md` / `README.zh-CN.md`、`CONTRIBUTING.md` / `CONTRIBUTING.zh-CN.md`、各 package README、`examples/`。
- 官网文档：`docs/content/docs/`。新增页面须同步更新 `docs/content/docs/meta.json` 与 `meta.cn.json`。本地预览用 `make docs`。

### agents/ 驱动约定

- 不要手动改 `agents/versions.json`，发布工作流会自动 bump 发生变化的模块。
- 仅新增驱动时才登记初始版本；新增 Java/JDBC 驱动还要同步 `agents/settings.gradle` 与支持列表。
- 本地验证 Java Agent：构建 `shadowJar` → 备份并覆盖 `~/.dbx/agents/drivers/<db_type>/agent.jar` → 重启 DBX 或重新连接数据库。
- 本地驱动安装会优先查找 `agents/drivers/<db_type>/build/libs/` 下的构建产物。

---

## 7. 注意事项 / 易踩坑

1. **首次构建慢且需联网**：完整 `make` 会编译约 900+ Rust crate + 拉取 git fork 依赖，首次耗时数分钟至十几分钟。若网络受限导致 git 依赖拉取卡住，需为 cargo 配置可访问 GitHub 的网络/代理（`CARGO_NET_GIT_FETCH_WITH_CLI=true` + 代理 env，或 `~/.cargo/config.toml` 的 `[http] proxy`）。后续增量构建很快。
2. **DuckDB 与 `dev-fast`**：完整 `make` 含全部默认特性；`make dev-fast` / `cargo-*-fast` 用 `--no-default-features` 加速迭代（`dev-fast` 保留 `duckdb-sidecar`）。发布构建始终全特性。
3. **端口 1420**：Tauri 开发模式要求 `TAURI_DEV_PORT`（默认 1420）空闲；被占用时 `make dev` / `make dev-fast` 会失败。仅前端 `make dev-web` 用 5173，不冲突。
4. **`make check` 非修复型**：它只检查不自动改，格式问题先跑 `pnpm fmt` / `cargo fmt`。
5. **平台可选包 WARN**：`pnpm install` 时会针对非当前平台的 `packages/cli-*`、`packages/mcp-*` 报「Unsupported platform」警告，属预期且无害。
6. **JDK 21 仅限 agents**：桌面端构建不依赖 Java；仅 `cd agents && ./gradlew test` 需要 JDK 21（`JAVA_HOME` 或 Gradle toolchain 自动下载）。
7. **发布特性不可裁剪**：`--no-default-features` 仅用于本地开发加速；`pnpm tauri build` 始终包含全部默认特性，勿为发布构建裁剪特性。

---

## 8. 参考文档

- `CONTRIBUTING.zh-CN.md`：环境要求、本地运行、JDBC Agent 驱动、项目结构、测试命令、PR 流程。
- `README.zh-CN.md`：功能、安装、自托管 Docker、快速开始、技术栈。
- `Makefile`：所有可用目标的权威定义（`make help` 可查看）。
- `crates/README.md`：Rust crate 划分。
- `agents/README.md`：JDBC Agent 驱动工程说明。
- `packages/mcp-server/README.md`、`packages/cli/README.md`：MCP Server 与 CLI 用法。
