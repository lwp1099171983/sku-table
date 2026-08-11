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
- `backup-to-cos.sh`：在备份容器中执行自定义格式的 `pg_dump`，上传 COS 并以对象大小校验上传结果；上传失败时将临时备份保留在服务器暂存目录。
- `run-database-backup.sh`：服务器端入口，检查 PostgreSQL 健康和备份配置，并用文件锁防止并发运行。
- `install-backup-timer.sh`：安装并启用每日备份的 systemd timer。

## COS 自动备份

生产服务器的 `/opt/sku-table/state/.env` 需要追加以下配置，且文件权限保持为 `600`：

```dotenv
COS_BUCKET=sku-table-backups-1321149166
COS_REGION=ap-guangzhou
COS_PREFIX=postgres
COS_SECRET_ID=<仅备份账号的 SecretId>
COS_SECRET_KEY=<仅备份账号的 SecretKey>
BACKUP_STAGING_DIR=/opt/sku-table/state/backup-staging
```

为 `sku-table-backup` CAM 用户创建并绑定自定义策略。策略仅允许该桶 `postgres/` 前缀的上传和对象校验：

```json
{
  "version": "2.0",
  "statement": [
    {
      "effect": "allow",
      "action": [
        "name/cos:PutObject",
        "name/cos:HeadObject"
      ],
      "resource": [
        "qcs::cos:ap-guangzhou:uid/1321149166:sku-table-backups-1321149166/postgres/*"
      ]
    }
  ]
}
```

配置凭据后，在服务器执行：

```bash
cd /opt/sku-table/current
docker compose --env-file /opt/sku-table/state/.env -f infra/docker/docker-compose.yml --profile ops build backup
./infra/scripts/install-backup-timer.sh
systemctl start sku-table-backup.service
systemctl status sku-table-backup.service --no-pager
systemctl list-timers sku-table-backup.timer
```

timer 每天服务器本地时间约 `03:20` 执行，最多随机延迟 10 分钟。COS 生命周期负责删除超过 14 天的对象；备份账号不具备删除权限。

## 发布配置（.deploy.env）

本地 `infra/scripts/.deploy.env` 保存发布所需的服务器信息（不入库，`.gitignore` 已排除）：

| 字段 | 当前值 |
| --- | --- |
| `SKU_TABLE_HOST` | `159.75.175.121`（当前生产服务器） |
| `SKU_TABLE_SSH_USER` | `root` |
| `SKU_TABLE_SSH_KEY` | `/Users/nstarlin/Desktop/服务器/sku_a_xiong.pem`（当前生产服务器密钥） |
| `SKU_TABLE_PROJECT_DIR` | `/opt/sku-table` |

发布命令：

- 完整发布：`./infra/scripts/release.sh 0.1.4`（升版本号 → 提交 → 打标签 → 推送 GitHub → 部署服务器）；
- 跳过 Git 仅部署当前代码：`./infra/scripts/release.sh 0.1.4 --skip-git`。

密钥保管约定：

- 私钥 `sku_a_xiong.pem` 权限保持 `600`，只放本机，不提交 Git、不传网盘；
- 服务器 `state/.env` 含生产凭据，仅 root 可读；
- 服务器 `current` 为软链，指向当前发布的版本目录。
