# AGENTS.md

<SPECULO>
## Speculo 运行时配置

### 初始化状态检查

运行时必须读取以下文件以确认 Speculo 初始化状态：

- ./speculo/.speculo/workspace.json — 工作区根别名配置
- ./speculo/config.json — 项目配置文件
- ./speculo/.speculo/migration.json — 运行时迁移状态（存在时读取）

若上述文件不存在或内容为空，说明项目尚未完成 Speculo 初始化。
此时必须提示用户：请先运行 speculo init 完成初始化配置。

若 migration.json 存在且 status 为 pending，必须停止所有 workflow 读取和状态写入，提示用户运行 migrate-runtime-state command；只有该 command 可以在 pending 期间执行。

### 工作流入口（强制读取）

初始化时已选择以下工作流，运行时必须强制读取对应入口文件：

- ./speculo/workflows/specdev/INDEX.md
</SPECULO>
