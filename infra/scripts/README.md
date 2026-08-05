# 运维脚本

这里放数据库备份、恢复演练、健康检查和日志维护脚本。脚本只读取环境变量，不把生产凭据写入仓库。

## 接入顺序

1. 先在腾讯云服务器部署 `infra/docker/docker-compose.yml`；
2. 确认 PostgreSQL 容器为 `healthy`、API 可连接数据库，并验证容器重启后数据卷仍可用；
3. 上述验证通过后，再在本目录接入每日 `pg_dump` → 腾讯云 COS 自动备份和恢复演练脚本。

服务器 COS 基础配置已完成；PostgreSQL 验证通过前不启用备份定时任务。

## 已有脚本

- `deploy.sh`：先启动和验收 PostgreSQL，再构建并启动 API/Web；
- `verify-postgres.sh`：验证 PostgreSQL 健康、连接、端口隔离，可选执行重启后持久化检查。
