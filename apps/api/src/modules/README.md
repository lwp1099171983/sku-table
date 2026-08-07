# 业务模块

按业务域拆分服务，例如 `auth`、`employee-work`、`ledger` 和 `shops`。模块内部维护 service、repository 和 parser，路由层只负责 HTTP 适配。
