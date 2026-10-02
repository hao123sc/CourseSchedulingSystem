-- 001_init.sql · 全部建表
-- 本文件 DDL 逐字取自 docs/03-数据模型设计.md 第 3 章「建表 DDL」，一字不改。
-- 如需变更结构，一律新增 migration 文件，不修改本历史文件。

-- ===== 3.1 学校与学期 =====
CREATE TABLE school (
  id            INTEGER PRIMARY KEY CHECK (id = 1),   -- 单机单校
  name          TEXT    NOT NULL,
  school_type   TEXT    NOT NULL,        -- primary|junior|senior|nine_year|complete|twelve_year
  logo_path     TEXT,
  created_at    TEXT    NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE semester (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  name          TEXT    NOT NULL,        -- "2026-2027学年第一学期"
  start_date    TEXT,
  end_date      TEXT,
  is_current    INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT    NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE UNIQUE INDEX ux_semester_current ON semester(is_current) WHERE is_current = 1;

-- ===== 3.2 学段 =====
CREATE TABLE stage (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  code          TEXT    NOT NULL UNIQUE,   -- primary|junior|senior|<自定义>
  name          TEXT    NOT NULL,          -- 小学 / 初中 / 高中
  sort_order    INTEGER NOT NULL DEFAULT 0,
  -- 作息与排课参数
  days_per_week INTEGER NOT NULL DEFAULT 5,   -- 5 或 6
  has_evening   INTEGER NOT NULL DEFAULT 0,   -- 是否有晚自习
  enabled       INTEGER NOT NULL DEFAULT 1
);

-- 时间槽：每学段独立的「星期 × 节次」定义
CREATE TABLE time_slot (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  stage_id      INTEGER NOT NULL REFERENCES stage(id) ON DELETE CASCADE,
  day_of_week   INTEGER NOT NULL,          -- 1..7
  period_index  INTEGER NOT NULL,          -- 当天第几节，从 1 开始
  period_name   TEXT    NOT NULL,          -- "第1节" / "早读" / "晚自习1"
  segment       TEXT    NOT NULL,          -- morning|afternoon|evening
  start_time    TEXT,                      -- "08:00"
  end_time      TEXT,                      -- "08:40"
  is_teaching   INTEGER NOT NULL DEFAULT 1,-- 0=课间操/午休等非教学占位
  sort_order    INTEGER NOT NULL DEFAULT 0
);
CREATE UNIQUE INDEX ux_slot ON time_slot(stage_id, day_of_week, period_index);
CREATE INDEX ix_slot_stage ON time_slot(stage_id);

-- ===== 3.3 年级与班级 =====
CREATE TABLE grade (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  semester_id   INTEGER NOT NULL REFERENCES semester(id) ON DELETE CASCADE,
  stage_id      INTEGER NOT NULL REFERENCES stage(id),
  name          TEXT    NOT NULL,          -- "初一" / "五年级" / "高二"
  enroll_year   INTEGER,                   -- 入学年份
  sort_order    INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX ix_grade_sem ON grade(semester_id);

CREATE TABLE klass (                        -- class 是保留字，用 klass
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  grade_id      INTEGER NOT NULL REFERENCES grade(id) ON DELETE CASCADE,
  name          TEXT    NOT NULL,          -- "初一(1)班"
  short_name    TEXT,                      -- "1班"
  student_count INTEGER NOT NULL DEFAULT 45,
  head_teacher_id INTEGER REFERENCES teacher(id) ON DELETE SET NULL,
  home_room_id  INTEGER REFERENCES classroom(id) ON DELETE SET NULL,  -- 固定教室
  is_virtual    INTEGER NOT NULL DEFAULT 0, -- 1=走班虚拟教学班
  sort_order    INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX ix_klass_grade ON klass(grade_id);

-- ===== 3.4 学科 / 教师 / 教室 =====
CREATE TABLE subject (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  name          TEXT    NOT NULL,
  short_name    TEXT    NOT NULL,          -- 课表格子里显示的 1-2 字
  color         TEXT    NOT NULL,          -- "#4F7DF3"，课表配色
  category      TEXT    NOT NULL DEFAULT 'main',  -- main|minor|activity
  importance    INTEGER NOT NULL DEFAULT 3,-- 1..5，用于单日难度均衡
  need_special_room INTEGER NOT NULL DEFAULT 0,
  stage_id      INTEGER REFERENCES stage(id) ON DELETE CASCADE,  -- NULL=通用
  -- 分布策略
  daily_max     INTEGER NOT NULL DEFAULT 1,     -- 同班每日最多节数
  week_spread   TEXT    NOT NULL DEFAULT 'spread', -- spread|concentrate
  sort_order    INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE teacher (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  name          TEXT    NOT NULL,
  staff_no      TEXT,
  phone         TEXT,
  max_weekly_periods INTEGER NOT NULL DEFAULT 18,
  building      TEXT,                      -- 办公楼栋，用于"跨楼栋连续调动"软约束
  enabled       INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE teacher_subject (             -- 一师多科
  teacher_id    INTEGER NOT NULL REFERENCES teacher(id) ON DELETE CASCADE,
  subject_id    INTEGER NOT NULL REFERENCES subject(id) ON DELETE CASCADE,
  PRIMARY KEY (teacher_id, subject_id)
);

CREATE TABLE classroom (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  name          TEXT    NOT NULL,
  room_type     TEXT    NOT NULL DEFAULT 'normal', -- normal|lab|computer|music|art|sports|other
  -- ★ 两种容量，语义完全不同，不可混用
  capacity      INTEGER NOT NULL DEFAULT 50,   -- 座位数/可容纳学生人数
  concurrent_capacity INTEGER NOT NULL DEFAULT 1, -- ★ 同一时段可同时容纳的「教学班数」
  building      TEXT,
  enabled       INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE subject_classroom (           -- 学科→可用专用教室
  subject_id    INTEGER NOT NULL REFERENCES subject(id) ON DELETE CASCADE,
  classroom_id  INTEGER NOT NULL REFERENCES classroom(id) ON DELETE CASCADE,
  -- ★ 该学科在该场地占用的"班位"数。默认1；
  --   若某科占地大（如足球课占整片操场）可设 2 或更多
  slots_taken   INTEGER NOT NULL DEFAULT 1,
  priority      INTEGER NOT NULL DEFAULT 0,  -- 多个可选场地时的优先级
  PRIMARY KEY (subject_id, classroom_id)
);

-- 场地并发使用的额外约束表（可选：限制哪些学科可共用同一场地）
CREATE TABLE room_coexist_rule (
  classroom_id  INTEGER NOT NULL REFERENCES classroom(id) ON DELETE CASCADE,
  subject_a     INTEGER NOT NULL REFERENCES subject(id) ON DELETE CASCADE,
  subject_b     INTEGER NOT NULL REFERENCES subject(id) ON DELETE CASCADE,
  allowed       INTEGER NOT NULL DEFAULT 1,   -- 0=这两科不可同场地同时上
  PRIMARY KEY (classroom_id, subject_a, subject_b)
);

-- ===== 3.5 教学任务 =====
CREATE TABLE teaching_task (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  semester_id   INTEGER NOT NULL REFERENCES semester(id) ON DELETE CASCADE,
  class_id      INTEGER NOT NULL REFERENCES klass(id) ON DELETE CASCADE,
  subject_id    INTEGER NOT NULL REFERENCES subject(id) ON DELETE CASCADE,
  teacher_id    INTEGER REFERENCES teacher(id) ON DELETE SET NULL,
  weekly_periods INTEGER NOT NULL,          -- 周课时数
  -- 连堂
  consecutive_count INTEGER NOT NULL DEFAULT 0,  -- 需要几组连堂
  consecutive_size  INTEGER NOT NULL DEFAULT 2,  -- 每组几节
  -- 单双周
  week_mode     TEXT    NOT NULL DEFAULT 'all',  -- all|odd|even
  -- 合班
  merge_group_id INTEGER REFERENCES constraint_group(id) ON DELETE SET NULL,
  fixed_room_id INTEGER REFERENCES classroom(id) ON DELETE SET NULL
);
CREATE UNIQUE INDEX ux_task ON teaching_task(semester_id, class_id, subject_id, week_mode);
CREATE INDEX ix_task_teacher ON teaching_task(teacher_id);

-- ===== 3.6 规则 =====
-- 四层时段规则值：统一表达"不排/避排/常规/优选"
CREATE TABLE time_rule (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  semester_id   INTEGER NOT NULL REFERENCES semester(id) ON DELETE CASCADE,
  scope_type    TEXT    NOT NULL,   -- teacher|class|subject|grade|global
  scope_id      INTEGER,            -- 对应实体 id；global 时为 NULL
  slot_id       INTEGER NOT NULL REFERENCES time_slot(id) ON DELETE CASCADE,
  rule_value    TEXT    NOT NULL    -- FORBIDDEN|AVOID|NORMAL|PREFERRED
                  CHECK (rule_value IN ('FORBIDDEN','AVOID','NORMAL','PREFERRED'))
);
CREATE UNIQUE INDEX ux_time_rule ON time_rule(semester_id, scope_type, scope_id, slot_id);
CREATE INDEX ix_time_rule_lookup ON time_rule(semester_id, scope_type, scope_id);

-- 约束组：互斥/拼合/跟随/同时上课
CREATE TABLE constraint_group (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  semester_id   INTEGER NOT NULL REFERENCES semester(id) ON DELETE CASCADE,
  group_type    TEXT    NOT NULL,   -- teacher_mutex|subject_mutex|merge|follow|simultaneous
  name          TEXT    NOT NULL,
  hardness      TEXT    NOT NULL DEFAULT 'hard',  -- hard|soft
  max_concurrent INTEGER,           -- 软互斥时的并发上限
  scope_note    TEXT                -- same_day|same_slot 等语义补充
);

CREATE TABLE group_member (
  group_id      INTEGER NOT NULL REFERENCES constraint_group(id) ON DELETE CASCADE,
  member_type   TEXT    NOT NULL,   -- teacher|subject|class|task
  member_id     INTEGER NOT NULL,
  PRIMARY KEY (group_id, member_type, member_id)
);

-- 预排锁定：升旗、班会等固定占位
CREATE TABLE fixed_lesson (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  semester_id   INTEGER NOT NULL REFERENCES semester(id) ON DELETE CASCADE,
  class_id      INTEGER REFERENCES klass(id) ON DELETE CASCADE,
  grade_id      INTEGER REFERENCES grade(id) ON DELETE CASCADE,  -- 整年级固定
  subject_id    INTEGER REFERENCES subject(id) ON DELETE SET NULL,
  teacher_id    INTEGER REFERENCES teacher(id) ON DELETE SET NULL,
  classroom_id  INTEGER REFERENCES classroom(id) ON DELETE SET NULL,
  slot_id       INTEGER NOT NULL REFERENCES time_slot(id) ON DELETE CASCADE,
  label         TEXT                       -- "升旗仪式"
);

-- 软约束权重（风格档位）
CREATE TABLE weight_profile (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  code          TEXT    NOT NULL UNIQUE,   -- teacher_first|student_first|balanced|custom
  name          TEXT    NOT NULL,
  payload       TEXT    NOT NULL           -- JSON: { "S1": 40, "S2": 30, ... }
);

-- ===== 3.7 课表结果与版本 =====
CREATE TABLE schedule_version (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  semester_id   INTEGER NOT NULL REFERENCES semester(id) ON DELETE CASCADE,
  parent_id     INTEGER REFERENCES schedule_version(id) ON DELETE SET NULL,
  name          TEXT    NOT NULL,          -- "自动排课 #1 · 均衡"
  weight_profile TEXT,                     -- 使用的风格档位
  hard_violations INTEGER NOT NULL DEFAULT 0,
  soft_score    REAL    NOT NULL DEFAULT 0,
  metrics       TEXT,                      -- JSON: 各维度指标快照
  solve_ms      INTEGER,
  is_published  INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT    NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE INDEX ix_version_sem ON schedule_version(semester_id);

CREATE TABLE lesson (                       -- 课表项：唯一事实表
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  version_id    INTEGER NOT NULL REFERENCES schedule_version(id) ON DELETE CASCADE,
  task_id       INTEGER NOT NULL REFERENCES teaching_task(id) ON DELETE CASCADE,
  class_id      INTEGER NOT NULL REFERENCES klass(id),
  subject_id    INTEGER NOT NULL REFERENCES subject(id),
  teacher_id    INTEGER REFERENCES teacher(id),
  classroom_id  INTEGER REFERENCES classroom(id),
  slot_id       INTEGER NOT NULL REFERENCES time_slot(id),
  week_mode     TEXT    NOT NULL DEFAULT 'all',   -- all|odd|even
  is_locked     INTEGER NOT NULL DEFAULT 0,
  consecutive_group TEXT,                    -- 同一连堂组共享一个 uuid
  remark        TEXT
);
-- 查询与冲突检测的关键索引
CREATE INDEX ix_lesson_ver_class   ON lesson(version_id, class_id, slot_id);
CREATE INDEX ix_lesson_ver_teacher ON lesson(version_id, teacher_id, slot_id);
CREATE INDEX ix_lesson_ver_room    ON lesson(version_id, classroom_id, slot_id);
CREATE INDEX ix_lesson_task        ON lesson(task_id);

CREATE TABLE adjust_log (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  version_id    INTEGER NOT NULL REFERENCES schedule_version(id) ON DELETE CASCADE,
  action        TEXT    NOT NULL,          -- move|swap|lock|unlock|delete
  before_json   TEXT,
  after_json    TEXT,
  reason        TEXT,
  created_at    TEXT    NOT NULL DEFAULT (datetime('now','localtime'))
);

-- ===== 3.8 走班（高中扩展） =====
CREATE TABLE elective_combo (               -- 选科组合，如 "物化生"
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  grade_id      INTEGER NOT NULL REFERENCES grade(id) ON DELETE CASCADE,
  name          TEXT    NOT NULL,
  subject_ids   TEXT    NOT NULL,          -- JSON 数组
  student_count INTEGER NOT NULL DEFAULT 0
);
-- 走班教学班直接复用 klass 表，is_virtual=1，
-- 通过 virtual_class_source 记录其学生来自哪些行政班，用于生成"学生冲突"约束
CREATE TABLE virtual_class_source (
  virtual_class_id INTEGER NOT NULL REFERENCES klass(id) ON DELETE CASCADE,
  origin_class_id  INTEGER NOT NULL REFERENCES klass(id) ON DELETE CASCADE,
  student_count    INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (virtual_class_id, origin_class_id)
);
