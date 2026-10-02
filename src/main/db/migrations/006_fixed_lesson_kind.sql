-- 006_fixed_lesson_kind.sql
-- 预排锁定新增「语义类型」：区分「排一节课」与「仅占用资源」。
--
-- 背景：原先 fixed_lesson 一律要求绑定班级或整年级（见 shared/constraints/fixedLesson.ts
-- 的第 0 条校验），无法表达「计算机教室周三下午维护」「田径场被校运会外借」
-- 「王老师周四第 7 节教研例会」这类**不产生课、但让资源不可用**的占位。
-- 而 time_rule 的 scope_type 只有 teacher|class|subject|grade|global，没有教室维度，
-- 场地不可用在此之前根本无处录入。
--
--   kind = 'lesson'  预排课：必须有 class_id 或 grade_id，占「班级 + 教师 + 场地」三份资源
--   kind = 'block'   仅占用：不绑班级，至少占 teacher_id / classroom_id 之一；
--                    占场地时视为**独占**（吃满 concurrent_capacity），因为维护/外借
--                    针对的是整个场地而非某个班位
--
-- 历史数据一律回填 'lesson'，语义与升级前完全一致。

ALTER TABLE fixed_lesson
  ADD COLUMN kind TEXT NOT NULL DEFAULT 'lesson'
  CHECK (kind IN ('lesson', 'block'));

-- 教室视角 / 教师视角的周课表网格按「学期 + 资源」取数，补两条检索路径
CREATE INDEX IF NOT EXISTS ix_fixed_sem_room    ON fixed_lesson(semester_id, classroom_id);
CREATE INDEX IF NOT EXISTS ix_fixed_sem_teacher ON fixed_lesson(semester_id, teacher_id);
