# 运维脚本

这里放数据库备份、恢复演练、健康检查和日志维护脚本。脚本只读取环境变量，不把生产凭据写入仓库。

## 接入顺序

1. 先在腾讯云服务器部署 `infra/docker/docker-compose.yml`；
2. 确认 PostgreSQL 容器为 `healthy`、API 可连接数据库，并验证容器重启后数据卷仍可用；
3. 上述验证通过后，再在本目录接入每日 `pg_dump` → 腾讯云 COS 自动备份和恢复演练脚本。

服务器 COS 基础配置已完成；PostgreSQL 验证通过前不启用备份定时任务。

## 已有脚本

- `deploy.sh`：先启动和验收 PostgreSQL，再构建并启动 API/Web；默认不重启 PostgreSQL，首次部署或数据库/卷变更时加 `--persistence` 验证数据卷持久化；
- `remote-deploy.sh`：发布时执行备份、构建、迁移、启动与健康检查，`--persistence` 可选透传给 `deploy.sh` 做持久化验收；
- `verify-postgres.sh`：验证 PostgreSQL 健康、连接、端口隔离，`--persistence` 可选执行重启后持久化检查。

## 发布配置（.deploy.env）

本地 `infra/scripts/.deploy.env` 保存发布所需的服务器信息（不入库，`.gitignore` 已排除）：

| 字段 | 当前值 |
| --- | --- |
| `SKU_TABLE_HOST` | `1.14.186.143`（腾讯云轻量服务器） |
| `SKU_TABLE_SSH_USER` | `root` |
| `SKU_TABLE_SSH_KEY` | `/Users/nstarlin/Desktop/服务器/sku_table.pem`（腾讯云密钥对） |
| `SKU_TABLE_PROJECT_DIR` | `/opt/sku-table` |

发布命令：

- 完整发布：`./infra/scripts/release.sh 0.1.4`（升版本号 → 提交 → 打标签 → 推送 GitHub → 部署服务器）；
- 跳过 Git 仅部署当前代码：`./infra/scripts/release.sh 0.1.4 --skip-git`。

密钥保管约定：

- 私钥 `sku_table.pem` 权限保持 `600`，只放本机，不提交 Git、不传网盘；
- 服务器 `state/.env` 含生产凭据，仅 root 可读；
- 服务器 `current` 为软链，指向当前发布的版本目录。
