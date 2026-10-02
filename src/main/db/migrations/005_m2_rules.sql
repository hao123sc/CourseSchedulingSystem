-- 005_m2_rules.sql · M2「教学任务与规则」所需的补充索引与完整性约束
-- 原则：只增不改。001_init.sql 已按 docs/03 §3 建好全部表结构，本迁移不新增/修改任何列，
--       仅补齐 M2 查询路径上的索引，以及 001 中因 SQLite NULL 语义而失效的唯一性保护。

-- ── 1. 全局作用域时段规则的唯一性 ────────────────────────────────────────────
-- 001 的 ux_time_rule(semester_id, scope_type, scope_id, slot_id) 在 scope_type='global'
-- 时 scope_id 为 NULL；SQLite 中 NULL 彼此不相等，唯一索引对全局规则形同虚设，
-- 会导致同一 (学期, 时段) 插入多条全局规则。用条件唯一索引补上这层保护。
CREATE UNIQUE INDEX IF NOT EXISTS ux_time_rule_global
  ON time_rule(semester_id, slot_id)
  WHERE scope_type = 'global';

-- ── 2. 时段规则按 slot 反查（组装 SolverInput 时按 slot 聚合四层规则） ──────
CREATE INDEX IF NOT EXISTS ix_time_rule_slot ON time_rule(semester_id, slot_id);

-- ── 3. 教学任务矩阵按「学期 + 班级」整行读取 ────────────────────────────────
CREATE INDEX IF NOT EXISTS ix_task_sem_class   ON teaching_task(semester_id, class_id);
CREATE INDEX IF NOT EXISTS ix_task_sem_subject ON teaching_task(semester_id, subject_id);
-- 工作量看板：按学期统计每位教师的周课时
CREATE INDEX IF NOT EXISTS ix_task_sem_teacher ON teaching_task(semester_id, teacher_id);

-- ── 4. 预排锁定 fixed_lesson 的常用检索路径 ─────────────────────────────────
CREATE INDEX IF NOT EXISTS ix_fixed_sem       ON fixed_lesson(semester_id);
CREATE INDEX IF NOT EXISTS ix_fixed_sem_slot  ON fixed_lesson(semester_id, slot_id);
CREATE INDEX IF NOT EXISTS ix_fixed_sem_class ON fixed_lesson(semester_id, class_id);
CREATE INDEX IF NOT EXISTS ix_fixed_sem_grade ON fixed_lesson(semester_id, grade_id);

-- ── 5. 约束组与成员 ─────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS ix_group_sem    ON constraint_group(semester_id);
CREATE INDEX IF NOT EXISTS ix_group_member ON group_member(member_type, member_id);
