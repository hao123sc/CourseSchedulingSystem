-- 007_adjust_log_index.sql
-- M6：换课调整日志按版本与时间倒序读取。
-- 结构断言在 migrations/index.ts 中验证索引实际存在。
CREATE INDEX IF NOT EXISTS ix_adjust_log_version_created
  ON adjust_log(version_id, created_at DESC, id DESC);
