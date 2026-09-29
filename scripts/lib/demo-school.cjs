/* eslint-disable */
/**
 * 「示范高完中」基础数据构造器 —— `seed:test` 与 `seed:m2` 共用的唯一一份定义。
 *
 * 分层：
 *   本文件（基础数据层） = 学校 / 学期 / 学段启用 / 年级班级 / 教室场地 / 教师与班主任
 *                        + 按课时方案推导出的「班 × 学科 × 课时 × 任课教师」清单（只算不写库）
 *   scripts/seed-test-data.cjs  = 只落基础数据（M1 验收口径）
 *   scripts/seed-m2-demo.cjs    = 基础数据 + 教学任务 / 四层规则 / 预排锁定 / 约束组（M2 验收口径）
 *
 * 两个脚本跑出来的基础数据**逐字节一致**，先后顺序任意、可反复运行（幂等）。
 *
 * 基准（docs/06 M2 验收 · docs/03 §5 示例学校）：
 *   示范高完中 complete = 初中部（初一~初三）+ 高中部（高一~高三），各 20 班 = 120 班，每班 45 人
 *   初中作息 8 节/天 × 5 天 = 40 槽/周；高中 早读 + 9 节 + 3 节晚自习 = 13 节/天 = 65 槽/周
 */
const path = require('path')
const fs = require('fs')

const PROJECT_ROOT = path.resolve(__dirname, '..', '..')

const MIGRATIONS = [
  { version: 1, file: '001_init.sql' },
  { version: 2, file: '002_seed_stages.sql' },
  { version: 3, file: '003_seed_subjects.sql' },
  { version: 4, file: '004_seed_weights.sql' },
  { version: 5, file: '005_m2_rules.sql' }
]

/** 与 src/main/db/connection.ts 的 dev 分支一致：仓库根目录下 .local-data/data.db */
function getDbPath(app) {
  if (process.env.ZHIKEPAI_DB) return process.env.ZHIKEPAI_DB
  if (!app) throw new Error('未在 electron 下运行时必须通过环境变量 ZHIKEPAI_DB 指定数据库路径')
  const dir = app.isPackaged ? app.getPath('userData') : path.join(PROJECT_ROOT, '.local-data')
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  return path.join(dir, 'data.db')
}

function runMigrations(db) {
  db.exec(
    `CREATE TABLE IF NOT EXISTS schema_version (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL DEFAULT (datetime('now','localtime')));`
  )
  const applied = new Set(
    db
      .prepare('SELECT version FROM schema_version')
      .all()
      .map((r) => r.version)
  )
  const record = db.prepare('INSERT INTO schema_version (version) VALUES (?)')
  const dir = path.join(PROJECT_ROOT, 'src', 'main', 'db', 'migrations')
  for (const m of MIGRATIONS) {
    if (applied.has(m.version)) continue
    const sql = fs.readFileSync(path.join(dir, m.file), 'utf-8')
    db.transaction(() => {
      db.exec(sql)
      record.run(m.version)
    })()
  }
}

const SCHOOL_NAME = '示范高完中'
const SCHOOL_TYPE = 'complete'
const SEMESTER_1 = { name: '2026-2027学年第一学期', start: '2026-09-01', end: '2027-01-10' }
const SEMESTER_2 = { name: '2026-2027学年第二学期', start: '2027-03-01', end: '2027-07-01' }
const CLASSES_PER_GRADE = 20
const STUDENTS_PER_CLASS = 45
const MAX_WEEKLY = 18

/**
 * 课时方案：与 src/shared/curriculumPresets.ts 的初中三套 + 高中三套逐科一致，
 * 唯一差别是去掉「班会」——班会由 fixed_lesson 预排占位承担，避免同一节课被算两遍。
 */
const STAGES = [
  {
    code: 'junior',
    label: '初中部',
    building: '初中部',
    grades: {
      初一: {
        语文: 5,
        数学: 5,
        英语: 4,
        体育: 3,
        道德与法治: 2,
        历史: 2,
        地理: 2,
        生物: 2,
        音乐: 1,
        美术: 1,
        信息技术: 1,
        劳动: 1,
        综合实践: 1
      },
      初二: {
        语文: 5,
        数学: 5,
        英语: 4,
        体育: 3,
        物理: 2,
        道德与法治: 2,
        历史: 2,
        地理: 2,
        生物: 2,
        音乐: 1,
        美术: 1,
        信息技术: 1,
        劳动: 1,
        综合实践: 1
      },
      初三: {
        语文: 5,
        数学: 5,
        英语: 5,
        物理: 3,
        化学: 3,
        体育: 3,
        道德与法治: 2,
        历史: 2,
        音乐: 1,
        美术: 1,
        信息技术: 1,
        劳动: 1
      }
    }
  },
  {
    code: 'senior',
    label: '高中部',
    building: '高中部',
    grades: {
      高一: {
        语文: 4,
        数学: 4,
        英语: 4,
        物理: 2,
        化学: 2,
        生物: 2,
        政治: 2,
        历史: 2,
        地理: 2,
        信息技术: 2,
        体育: 2,
        通用技术: 1,
        音乐: 1,
        美术: 1,
        劳动: 1,
        综合实践: 1
      },
      高二: {
        语文: 4,
        数学: 4,
        英语: 4,
        物理: 3,
        化学: 3,
        生物: 3,
        政治: 3,
        历史: 3,
        地理: 3,
        体育: 2,
        信息技术: 1
      },
      高三: {
        语文: 5,
        数学: 5,
        英语: 5,
        物理: 3,
        化学: 3,
        生物: 3,
        政治: 3,
        历史: 3,
        地理: 3,
        体育: 2
      }
    }
  }
]

/** 班主任优先从这些学科的任课教师里挑（且必须任教本班，一人只带一个班） */
const HEAD_TEACHER_PRIORITY = [
  '语文',
  '数学',
  '英语',
  '物理',
  '化学',
  '生物',
  '政治',
  '道德与法治',
  '历史',
  '地理'
]

// 确定性教师姓名：20 姓 × 14 名 = 280 个不重复组合，够 ~260 名教师用
const SURNAMES = '王李张刘陈杨赵黄周吴徐孙胡朱高林何郭马罗'.split('')
const GIVEN = '伟芳娜秀英敏静丽强磊军洋勇艳'.split('')
function teacherName(i) {
  return SURNAMES[i % SURNAMES.length] + GIVEN[Math.floor(i / SURNAMES.length) % GIVEN.length]
}

/**
 * 幂等地建出「示范高完中」的全部基础数据。
 *
 * ⚠️ 会清空**当前学期**的年级（级联清掉班级 / 教学任务 / 预排 / 课表）再重建，
 *    并把 school 单例改写为「示范高完中」、停用小学学段。
 *
 * @returns {{
 *   semesterId: number, semesterName: string,
 *   gradeIds: Record<string, number>,
 *   classes: {id:number,stageCode:string,gradeName:string,gradeId:number,index:number,name:string}[],
 *   stageInfo: Record<string, {row:object, slots:object[], slotAt:Function, roles:object, days:number}>,
 *   subjectByName: Map<string, object>,
 *   rooms: object,
 *   teachers: {id:number,stageCode:string,subject:string,load:number,classes:number[]}[],
 *   pools: Map<string, object[]>,
 *   assignments: {classId:number,stageCode:string,gradeName:string,subjectId:number,subjectName:string,weeklyPeriods:number,teacherId:number|null}[],
 *   headOf: Map<number, number>
 * }}
 */
function buildBaseSchool(db) {
  // ── 学校 / 学期 ───────────────────────────────────────────────────
  db.prepare(
    `INSERT INTO school (id, name, school_type) VALUES (1, ?, ?)
     ON CONFLICT(id) DO UPDATE SET name = excluded.name, school_type = excluded.school_type`
  ).run(SCHOOL_NAME, SCHOOL_TYPE)

  const ensureSemester = (s) => {
    const found = db.prepare('SELECT * FROM semester WHERE name = ?').get(s.name)
    if (found) {
      db.prepare('UPDATE semester SET start_date=?, end_date=? WHERE id=?').run(
        s.start,
        s.end,
        found.id
      )
      return found.id
    }
    return Number(
      db
        .prepare('INSERT INTO semester (name, start_date, end_date) VALUES (?, ?, ?)')
        .run(s.name, s.start, s.end).lastInsertRowid
    )
  }
  const semesterId = ensureSemester(SEMESTER_1)
  ensureSemester(SEMESTER_2)
  db.prepare('UPDATE semester SET is_current = 0').run()
  db.prepare('UPDATE semester SET is_current = 1 WHERE id = ?').run(semesterId)

  // 幂等：清空当前学期的年级（级联清班级/任务/预排/课表）
  db.prepare('DELETE FROM grade WHERE semester_id = ?').run(semesterId)
  // 高完中只用初中/高中两个学段
  db.prepare(`UPDATE stage SET enabled = 1 WHERE code IN ('junior','senior')`).run()
  db.prepare(`UPDATE stage SET enabled = 0 WHERE code = 'primary'`).run()

  const subjectByName = new Map(
    db
      .prepare('SELECT * FROM subject')
      .all()
      .map((s) => [s.name, s])
  )

  // ── 教室与场地（按 120 班规模配并发容量；共享场地参数取自 docs/03 §5） ──
  const upsertRoom = (name, type, cap, concurrent, building) => {
    const found = db.prepare('SELECT * FROM classroom WHERE name = ?').get(name)
    if (found) {
      db.prepare(
        `UPDATE classroom SET room_type=?, capacity=?, concurrent_capacity=?, building=?, enabled=1 WHERE id=?`
      ).run(type, cap, concurrent, building, found.id)
      return found.id
    }
    return Number(
      db
        .prepare(
          `INSERT INTO classroom (name, room_type, capacity, concurrent_capacity, building)
           VALUES (?, ?, ?, ?, ?)`
        )
        .run(name, type, cap, concurrent, building).lastInsertRowid
    )
  }
  const multi = (prefix, count, type, cap, concurrent, building) =>
    Array.from({ length: count }, (_, i) =>
      upsertRoom(`${prefix}${i + 1}`, type, cap, concurrent, building)
    )
  const rooms = {
    sports: [
      upsertRoom('田径场', 'sports', 800, 4, '运动区'),
      upsertRoom('篮球场', 'sports', 150, 3, '运动区'),
      upsertRoom('风雨操场', 'sports', 300, 2, '运动区')
    ],
    music: multi('音乐教室', 3, 'music', 50, 1, '艺术楼'),
    art: multi('美术教室', 3, 'art', 50, 1, '艺术楼'),
    computer: multi('计算机房', 4, 'computer', 60, 1, '科技楼'),
    tech: multi('通用技术室', 2, 'other', 50, 1, '科技楼'),
    physics: multi('物理实验室', 2, 'lab', 48, 1, '实验楼'),
    chemistry: multi('化学实验室', 2, 'lab', 48, 1, '实验楼'),
    biology: multi('生物实验室', 2, 'lab', 48, 1, '实验楼')
  }

  // ── 逐学段建 年级 / 班级 / 班级教室，并解析该学段的作息角色 ────────
  const classes = []
  const gradeIds = {}
  const stageInfo = {}
  let sortOrder = 0

  for (const st of STAGES) {
    const row = db.prepare('SELECT * FROM stage WHERE code = ?').get(st.code)
    if (!row) throw new Error(`缺少内置学段 code=${st.code}，请先启动一次应用生成内置种子`)
    const slots = db
      .prepare(
        `SELECT * FROM time_slot WHERE stage_id = ? AND day_of_week <= ? AND is_teaching = 1
          ORDER BY day_of_week, period_index`
      )
      .all(row.id, row.days_per_week)
    const slotAt = (day, period) =>
      slots.find((s) => s.day_of_week === day && s.period_index === period)
    const day1 = slots.filter((s) => s.day_of_week === 1)
    // 作息角色全部从库里的 segment + period_name 推导，不写死节次编号，
    // 用户在「学段与作息编辑器」里改过节次后本脚本依然成立。
    const roles = {
      reading: day1.filter((s) => s.period_name.includes('早读')).map((s) => s.period_index),
      evening: day1.filter((s) => s.segment === 'evening').map((s) => s.period_index),
      morning: day1
        .filter((s) => s.segment === 'morning' && !s.period_name.includes('早读'))
        .map((s) => s.period_index),
      afternoon: day1.filter((s) => s.segment === 'afternoon').map((s) => s.period_index)
    }
    roles.firstLesson = roles.morning[0]
    roles.lastLesson = roles.afternoon[roles.afternoon.length - 1]
    stageInfo[st.code] = { row, slots, slotAt, roles, days: row.days_per_week }

    for (const gradeName of Object.keys(st.grades)) {
      sortOrder += 1
      const gid = Number(
        db
          .prepare(
            `INSERT INTO grade (semester_id, stage_id, name, enroll_year, sort_order)
             VALUES (?, ?, ?, ?, ?)`
          )
          .run(semesterId, row.id, gradeName, 2026, sortOrder).lastInsertRowid
      )
      gradeIds[gradeName] = gid
      for (let i = 1; i <= CLASSES_PER_GRADE; i++) {
        const name = `${gradeName}(${i})班`
        const roomId = upsertRoom(`${name}教室`, 'normal', 50, 1, st.building)
        const cid = Number(
          db
            .prepare(
              `INSERT INTO klass (grade_id, name, short_name, student_count, home_room_id, sort_order)
               VALUES (?, ?, ?, ?, ?, ?)`
            )
            .run(gid, name, `${i}班`, STUDENTS_PER_CLASS, roomId, i).lastInsertRowid
        )
        classes.push({ id: cid, stageCode: st.code, gradeName, gradeId: gid, index: i, name })
      }
    }
  }

  // ── 教师：初中部 / 高中部按学科分开建池 ───────────────────────────
  db.prepare(`DELETE FROM teacher WHERE staff_no LIKE 'T%'`).run()
  const pools = new Map() // `${stageCode}|${subjectName}` -> [teacher]
  const teachers = []
  const hireTeacher = (stageCode, sname) => {
    const st = STAGES.find((s) => s.code === stageCode)
    const subject = subjectByName.get(sname)
    if (!subject) return null
    const key = `${stageCode}|${sname}`
    const list = pools.get(key) ?? []
    const seq = teachers.length
    const tid = Number(
      db
        .prepare(
          `INSERT INTO teacher (name, staff_no, max_weekly_periods, building)
           VALUES (?, ?, ?, ?)`
        )
        .run(teacherName(seq), `T${String(seq + 1).padStart(4, '0')}`, MAX_WEEKLY, st.building)
        .lastInsertRowid
    )
    db.prepare('INSERT OR IGNORE INTO teacher_subject (teacher_id, subject_id) VALUES (?, ?)').run(
      tid,
      subject.id
    )
    const t = { id: tid, stageCode, subject: sname, load: 0, classes: [] }
    list.push(t)
    pools.set(key, list)
    teachers.push(t)
    return t
  }

  for (const st of STAGES) {
    const demand = new Map()
    for (const plan of Object.values(st.grades)) {
      for (const [sname, periods] of Object.entries(plan)) {
        demand.set(sname, (demand.get(sname) ?? 0) + periods * CLASSES_PER_GRADE)
      }
    }
    for (const [sname, total] of demand) {
      if (!subjectByName.get(sname)) continue
      // 整班课时不可拆分：按「一人最多带几个整班」向下取整算容量，避免尾数凑不满
      const maxOfOneClass = Math.max(...Object.values(st.grades).map((p) => p[sname] ?? 0))
      const perTeacher = Math.max(1, Math.floor(MAX_WEEKLY / maxOfOneClass) * maxOfOneClass)
      for (let i = 1; i <= Math.ceil(total / perTeacher); i++) hireTeacher(st.code, sname)
    }
  }

  // ── 按课时方案推导「班 × 学科 × 课时 × 任课教师」（只算不写库） ──────
  const assignments = []
  for (const k of classes) {
    const st = STAGES.find((s) => s.code === k.stageCode)
    for (const [sname, periods] of Object.entries(st.grades[k.gradeName])) {
      const subject = subjectByName.get(sname)
      if (!subject) continue
      const pool = pools.get(`${k.stageCode}|${sname}`) ?? []
      let picked = null
      for (const t of pool) {
        if (t.load + periods > MAX_WEEKLY) continue
        if (picked == null || t.load < picked.load) picked = t
      }
      // 预估不足时就地扩招，保证「零未指派任务」
      if (!picked) picked = hireTeacher(k.stageCode, sname)
      if (picked) {
        picked.load += periods
        picked.classes.push(k.id)
      }
      assignments.push({
        classId: k.id,
        stageCode: k.stageCode,
        gradeName: k.gradeName,
        subjectId: subject.id,
        subjectName: sname,
        weeklyPeriods: periods,
        teacherId: picked ? picked.id : null
      })
    }
  }

  // ── 班主任：必须任教本班，一人只当一个班的班主任 ───────────────────
  const usedHeads = new Set()
  const headOf = new Map()
  const setHead = db.prepare('UPDATE klass SET head_teacher_id = ? WHERE id = ?')
  for (const k of classes) {
    let chosen = null
    for (const sname of HEAD_TEACHER_PRIORITY) {
      const hit = (pools.get(`${k.stageCode}|${sname}`) ?? []).find(
        (t) => !usedHeads.has(t.id) && t.classes.includes(k.id)
      )
      if (hit) {
        chosen = hit
        break
      }
    }
    if (!chosen) continue
    usedHeads.add(chosen.id)
    headOf.set(k.id, chosen.id)
    setHead.run(chosen.id, k.id)
  }

  return {
    semesterId,
    semesterName: SEMESTER_1.name,
    gradeIds,
    classes,
    stageInfo,
    subjectByName,
    rooms,
    teachers,
    pools,
    assignments,
    headOf
  }
}

module.exports = {
  PROJECT_ROOT,
  MIGRATIONS,
  getDbPath,
  runMigrations,
  buildBaseSchool,
  SCHOOL_NAME,
  SCHOOL_TYPE,
  SEMESTER_1,
  SEMESTER_2,
  STAGES,
  CLASSES_PER_GRADE,
  STUDENTS_PER_CLASS,
  MAX_WEEKLY
}
