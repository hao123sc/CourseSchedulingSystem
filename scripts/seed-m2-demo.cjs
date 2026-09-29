/* eslint-disable */
/**
 * M2 验收种子：「示范初中」全量教学任务与规则。
 *
 * 目标 = docs/06 M2 验收标准：**为示范初中配齐全部教学任务与规则，
 * 数据可完整读出为 SolverInput**。一条命令铺好，便于真机点开 UI 逐项复核。
 *
 * 产出：
 *   学校    示范初中（junior）
 *   学期    2026-2027学年第一学期（设为当前）
 *   年级班级 初一/初二/初三 × 20 班 = 60 班，每班 45 人
 *   教室    60 间班级教室 + 田径场(并发4)/风雨操场(2)/篮球场(3) + 音乐/美术/计算机/理化生实验室
 *   教师    按各科课时需求自动测算数量，保证人人不超 18 节/周
 *   教学任务 按《义务教育课程方案(2022)》七/八/九年级课时方案套用（班会改由预排占位承担）
 *   时段规则 全局/学科/教师/班级四种作用域的示例规则（D4 四层值都有覆盖）
 *   学科规则 每日上限 + 分布策略 + 专用场地绑定（体育/音乐/美术/信息技术/理化生）
 *   预排锁定 周一第1节升旗（整年级）、周五第7节班会（整年级，班主任带）
 *   约束组   教师互斥(hard) / 学科互斥(soft, 并发上限) / 合班拼合(merge)
 *
 * 运行（必须用 electron 跑，匹配 better-sqlite3 的原生 ABI）：
 *   npm run seed:m2
 *
 * 幂等：先清空「当前学期」的年级（级联清掉班级/任务/预排/约束组成员）再重建，
 * 可反复运行得到一致结果。⚠️ 会把 school 单例改写为「示范初中」。
 */
const path = require('path')
const fs = require('fs')
const { app } = require('electron')
const Database = require('better-sqlite3')

const PROJECT_ROOT = path.resolve(__dirname, '..')

function getDbPath() {
  if (process.env.ZHIKEPAI_DB) return process.env.ZHIKEPAI_DB
  const dir = app.isPackaged ? app.getPath('userData') : path.join(PROJECT_ROOT, '.local-data')
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  return path.join(dir, 'data.db')
}

const MIGRATIONS = [
  { version: 1, file: '001_init.sql' },
  { version: 2, file: '002_seed_stages.sql' },
  { version: 3, file: '003_seed_subjects.sql' },
  { version: 4, file: '004_seed_weights.sql' },
  { version: 5, file: '005_m2_rules.sql' }
]

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

// ── 课时方案（与 src/shared/curriculumPresets.ts 的初中三套保持一致；班会改走预排占位） ──
const PLANS = {
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

const CLASSES_PER_GRADE = 20
const STUDENTS_PER_CLASS = 45
const MAX_WEEKLY = 18

function main() {
  const dbPath = getDbPath()
  const db = new Database(dbPath)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  runMigrations(db)

  const out = db.transaction(() => seed(db))()
  db.close()

  console.log('\n===== 示范初中 · M2 数据已就绪 =====')
  for (const [k, v] of Object.entries(out)) console.log(`  ${k.padEnd(14)} ${v}`)
  console.log(`  数据库          ${dbPath}`)
  console.log('\n打开「教学任务」「排课规则 → 输入自检」两页即可验收。')
}

function seed(db) {
  // ── 学校 / 学期 ───────────────────────────────────────────────────
  db.prepare(
    `INSERT INTO school (id, name, school_type) VALUES (1, ?, 'junior')
     ON CONFLICT(id) DO UPDATE SET name = excluded.name, school_type = excluded.school_type`
  ).run('示范初中')

  let sem = db.prepare('SELECT * FROM semester WHERE name = ?').get('2026-2027学年第一学期')
  if (!sem) {
    const info = db
      .prepare(`INSERT INTO semester (name, start_date, end_date) VALUES (?, ?, ?)`)
      .run('2026-2027学年第一学期', '2026-09-01', '2027-01-10')
    sem = db.prepare('SELECT * FROM semester WHERE id = ?').get(Number(info.lastInsertRowid))
  }
  db.prepare('UPDATE semester SET is_current = 0').run()
  db.prepare('UPDATE semester SET is_current = 1 WHERE id = ?').run(sem.id)

  // ── 清理：删本学期年级（级联清 班级 / 教学任务 / 预排 / 课表），以及本学期的规则与约束组 ──
  db.prepare('DELETE FROM grade WHERE semester_id = ?').run(sem.id)
  db.prepare('DELETE FROM time_rule WHERE semester_id = ?').run(sem.id)
  db.prepare('DELETE FROM fixed_lesson WHERE semester_id = ?').run(sem.id)
  db.prepare('DELETE FROM constraint_group WHERE semester_id = ?').run(sem.id)

  const stage = db.prepare(`SELECT * FROM stage WHERE code = 'junior'`).get()
  const slots = db
    .prepare(
      `SELECT * FROM time_slot WHERE stage_id = ? AND day_of_week <= ?
        ORDER BY day_of_week, period_index`
    )
    .all(stage.id, stage.days_per_week)
  const slotAt = (day, period) =>
    slots.find((s) => s.day_of_week === day && s.period_index === period)
  const periodsPerDay = Math.max(...slots.map((s) => s.period_index))

  const subjects = db.prepare('SELECT * FROM subject').all()
  const subjectByName = new Map(subjects.map((s) => [s.name, s]))

  // ── 教室与场地 ────────────────────────────────────────────────────
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

  const sharedRooms = {
    田径场: upsertRoom('田径场', 'sports', 800, 4, '室外'),
    风雨操场: upsertRoom('风雨操场', 'sports', 300, 2, 'B栋'),
    篮球场: upsertRoom('篮球场', 'sports', 150, 3, '室外'),
    音乐教室1: upsertRoom('音乐教室1', 'music', 50, 1, 'C栋'),
    音乐教室2: upsertRoom('音乐教室2', 'music', 50, 1, 'C栋'),
    美术教室1: upsertRoom('美术教室1', 'art', 50, 1, 'C栋'),
    美术教室2: upsertRoom('美术教室2', 'art', 50, 1, 'C栋'),
    计算机房1: upsertRoom('计算机房1', 'computer', 60, 1, 'D栋'),
    计算机房2: upsertRoom('计算机房2', 'computer', 60, 1, 'D栋'),
    物理实验室: upsertRoom('物理实验室', 'lab', 48, 1, 'D栋'),
    化学实验室: upsertRoom('化学实验室', 'lab', 48, 1, 'D栋'),
    生物实验室: upsertRoom('生物实验室', 'lab', 48, 1, 'D栋')
  }

  // ── 年级 / 班级 / 班级教室 ────────────────────────────────────────
  const gradeIds = {}
  const classes = [] // { id, gradeName }
  let sortOrder = 0
  for (const gradeName of Object.keys(PLANS)) {
    sortOrder += 1
    const gid = Number(
      db
        .prepare(
          `INSERT INTO grade (semester_id, stage_id, name, enroll_year, sort_order)
           VALUES (?, ?, ?, ?, ?)`
        )
        .run(sem.id, stage.id, gradeName, 2026 - sortOrder + 1, sortOrder).lastInsertRowid
    )
    gradeIds[gradeName] = gid
    for (let i = 1; i <= CLASSES_PER_GRADE; i++) {
      const name = `${gradeName}(${i})班`
      const roomId = upsertRoom(`${name}教室`, 'normal', 50, 1, 'A栋')
      const cid = Number(
        db
          .prepare(
            `INSERT INTO klass (grade_id, name, short_name, student_count, home_room_id, sort_order)
             VALUES (?, ?, ?, ?, ?, ?)`
          )
          .run(gid, name, `${i}班`, STUDENTS_PER_CLASS, roomId, i).lastInsertRowid
      )
      classes.push({ id: cid, gradeName, index: i, name })
    }
  }

  // ── 教师：按各科课时需求测算人数，保证不超 18 节/周 ────────────────
  const demandBySubject = new Map()
  for (const [gradeName, plan] of Object.entries(PLANS)) {
    for (const [sname, periods] of Object.entries(plan)) {
      demandBySubject.set(sname, (demandBySubject.get(sname) ?? 0) + periods * CLASSES_PER_GRADE)
    }
  }

  db.prepare(`DELETE FROM teacher WHERE staff_no LIKE 'M2%'`).run()
  const teachersBySubject = new Map()
  let staffSeq = 0
  const hireTeacher = (sname) => {
    const subject = subjectByName.get(sname)
    if (!subject) return null
    const list = teachersBySubject.get(sname) ?? []
    const seqInSubject = list.length + 1
    staffSeq += 1
    const tid = Number(
      db
        .prepare(
          `INSERT INTO teacher (name, staff_no, max_weekly_periods, building)
             VALUES (?, ?, ?, ?)`
        )
        .run(
          `${sname}${String(seqInSubject).padStart(2, '0')}`,
          `M2${String(staffSeq).padStart(3, '0')}`,
          MAX_WEEKLY,
          seqInSubject % 2 === 0 ? 'A栋' : 'B栋'
        ).lastInsertRowid
    )
    db.prepare('INSERT OR IGNORE INTO teacher_subject (teacher_id, subject_id) VALUES (?, ?)').run(
      tid,
      subject.id
    )
    const t = { id: tid, subject: sname, load: 0, classes: [] }
    list.push(t)
    teachersBySubject.set(sname, list)
    return t
  }
  for (const [sname, demand] of demandBySubject) {
    if (!subjectByName.get(sname)) continue
    // 预估人数：按「整班课时不可拆分」向下取整算每人可带班数，避免尾数凑不满
    const maxPeriodsOfOneClass = Math.max(...Object.values(PLANS).map((p) => p[sname] ?? 0))
    const perTeacher = Math.max(
      1,
      Math.floor(MAX_WEEKLY / maxPeriodsOfOneClass) * maxPeriodsOfOneClass
    )
    const need = Math.ceil(demand / perTeacher)
    for (let i = 1; i <= need; i++) hireTeacher(sname)
  }

  // ── 教学任务：套用课时方案 + 贪心指派教师（取当前负载最轻且不超限者） ──
  const insTask = db.prepare(
    `INSERT INTO teaching_task (semester_id, class_id, subject_id, teacher_id, weekly_periods,
                                consecutive_count, consecutive_size, week_mode)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'all')`
  )
  let taskCount = 0
  let periodCount = 0
  const taskIdByKey = new Map()
  for (const k of classes) {
    const plan = PLANS[k.gradeName]
    for (const [sname, periods] of Object.entries(plan)) {
      const subject = subjectByName.get(sname)
      if (!subject) continue
      const pool = teachersBySubject.get(sname) ?? []
      let picked = null
      for (const t of pool) {
        if (t.load + periods > MAX_WEEKLY) continue
        if (picked == null || t.load < picked.load) picked = t
      }
      // 预估不足时就地扩招，保证「零未指派任务」
      if (!picked) picked = hireTeacher(sname)
      if (picked) {
        picked.load += periods
        picked.classes.push(k.id)
      }
      // 语文每周留一组 2 节连堂写作文（验证 H10 连堂链路）
      const consecutive = sname === '语文' && periods >= 2 ? 1 : 0
      const id = Number(
        insTask.run(sem.id, k.id, subject.id, picked ? picked.id : null, periods, consecutive, 2)
          .lastInsertRowid
      )
      taskIdByKey.set(`${k.id}:${subject.id}`, id)
      taskCount += 1
      periodCount += periods
    }
  }

  // 班主任：必须任教本班，一人只当一个班的班主任，优先主科老师
  const HEAD_PRIORITY = [
    '语文',
    '数学',
    '英语',
    '道德与法治',
    '历史',
    '地理',
    '物理',
    '化学',
    '生物'
  ]
  const usedHeads = new Set()
  const headOf = new Map()
  for (const k of classes) {
    let chosen = null
    for (const sname of HEAD_PRIORITY) {
      const pool = teachersBySubject.get(sname) ?? []
      const hit = pool.find((t) => !usedHeads.has(t.id) && t.classes.includes(k.id))
      if (hit) {
        chosen = hit
        break
      }
    }
    if (!chosen) continue
    usedHeads.add(chosen.id)
    headOf.set(k.id, chosen.id)
    db.prepare('UPDATE klass SET head_teacher_id = ? WHERE id = ?').run(chosen.id, k.id)
  }

  // ── 学科规则：每日上限 / 分布策略 / 专用场地 ───────────────────────
  const setSubjectRule = (name, dailyMax, spread, needRoom) => {
    const s = subjectByName.get(name)
    if (!s) return
    db.prepare(
      'UPDATE subject SET daily_max = ?, week_spread = ?, need_special_room = ? WHERE id = ?'
    ).run(dailyMax, spread, needRoom ? 1 : 0, s.id)
  }
  setSubjectRule('语文', 2, 'spread', false)
  setSubjectRule('数学', 2, 'spread', false)
  setSubjectRule('英语', 2, 'spread', false)
  setSubjectRule('物理', 1, 'spread', false)
  setSubjectRule('化学', 1, 'spread', false)
  setSubjectRule('生物', 1, 'spread', false)
  setSubjectRule('体育', 1, 'spread', true)
  setSubjectRule('音乐', 1, 'spread', true)
  setSubjectRule('美术', 1, 'spread', true)
  setSubjectRule('信息技术', 1, 'spread', true)
  setSubjectRule('综合实践', 2, 'concentrate', false)
  setSubjectRule('劳动', 1, 'spread', false)

  const bindRooms = (subjectName, bindings) => {
    const s = subjectByName.get(subjectName)
    if (!s) return
    db.prepare('DELETE FROM subject_classroom WHERE subject_id = ?').run(s.id)
    const ins = db.prepare(
      `INSERT INTO subject_classroom (subject_id, classroom_id, slots_taken, priority)
       VALUES (?, ?, ?, ?)`
    )
    for (const b of bindings) ins.run(s.id, b.room, b.slots ?? 1, b.priority ?? 0)
  }
  bindRooms('体育', [
    { room: sharedRooms.田径场, slots: 1, priority: 3 },
    { room: sharedRooms.篮球场, slots: 1, priority: 2 },
    { room: sharedRooms.风雨操场, slots: 1, priority: 1 }
  ])
  bindRooms('音乐', [
    { room: sharedRooms.音乐教室1, priority: 1 },
    { room: sharedRooms.音乐教室2, priority: 1 }
  ])
  bindRooms('美术', [
    { room: sharedRooms.美术教室1, priority: 1 },
    { room: sharedRooms.美术教室2, priority: 1 }
  ])
  bindRooms('信息技术', [
    { room: sharedRooms.计算机房1, priority: 1 },
    { room: sharedRooms.计算机房2, priority: 1 }
  ])
  bindRooms('物理', [{ room: sharedRooms.物理实验室, priority: 1 }])
  bindRooms('化学', [{ room: sharedRooms.化学实验室, priority: 1 }])
  bindRooms('生物', [{ room: sharedRooms.生物实验室, priority: 1 }])

  // ── 四层时段规则（D4）：四种作用域都铺一点，四个规则值都用上 ─────────
  const insRule = db.prepare(
    `INSERT OR REPLACE INTO time_rule (semester_id, scope_type, scope_id, slot_id, rule_value)
     VALUES (?, ?, ?, ?, ?)`
  )
  const addRule = (scopeType, scopeId, slotId, value) => {
    if (!slotId) return
    // global 的 scope_id 为 NULL，唯一索引由 005 的条件唯一索引保证
    if (scopeType === 'global') {
      db.prepare(
        `DELETE FROM time_rule WHERE semester_id=? AND scope_type='global' AND scope_id IS NULL AND slot_id=?`
      ).run(sem.id, slotId)
      db.prepare(
        `INSERT INTO time_rule (semester_id, scope_type, scope_id, slot_id, rule_value)
         VALUES (?, 'global', NULL, ?, ?)`
      ).run(sem.id, slotId, value)
      return
    }
    insRule.run(sem.id, scopeType, scopeId, slotId, value)
  }

  let ruleCount = 0
  // 全局：周五最后一节大扫除，避排
  for (const period of [periodsPerDay]) {
    addRule('global', null, slotAt(5, period)?.id, 'AVOID')
    ruleCount += 1
  }
  // 学科：主课优选上午前 3 节；体育避排上午第 1 节、优选下午
  for (const sname of ['语文', '数学', '英语']) {
    const s = subjectByName.get(sname)
    if (!s) continue
    for (let d = 1; d <= stage.days_per_week; d++) {
      for (let p = 1; p <= 3; p++) {
        addRule('subject', s.id, slotAt(d, p)?.id, 'PREFERRED')
        ruleCount += 1
      }
    }
  }
  const pe = subjectByName.get('体育')
  if (pe) {
    for (let d = 1; d <= stage.days_per_week; d++) {
      addRule('subject', pe.id, slotAt(d, 1)?.id, 'AVOID')
      addRule('subject', pe.id, slotAt(d, periodsPerDay - 1)?.id, 'PREFERRED')
      ruleCount += 2
    }
  }
  // 教师：每科第 1 位教师周三下午教研，全禁排
  for (const [, pool] of teachersBySubject) {
    const t = pool[0]
    if (!t) continue
    for (let p = 6; p <= periodsPerDay; p++) {
      addRule('teacher', t.id, slotAt(3, p)?.id, 'FORBIDDEN')
      ruleCount += 1
    }
  }
  // 班级：初三各班周四最后两节留作年级测评，禁排（避开周一升旗与周一班会占位）
  for (const k of classes.filter((c) => c.gradeName === '初三')) {
    for (let p = periodsPerDay - 1; p <= periodsPerDay; p++) {
      addRule('class', k.id, slotAt(4, p)?.id, 'FORBIDDEN')
      ruleCount += 1
    }
  }
  // 年级：初一周一第 2 节年级例会，避排
  addRule('grade', gradeIds['初一'], slotAt(1, 2)?.id, 'AVOID')
  ruleCount += 1

  // ── 预排锁定：升旗（周一第1节）+ 班会（周一最后一节，班主任带） ─────────
  const insFixed = db.prepare(
    `INSERT INTO fixed_lesson (semester_id, class_id, grade_id, subject_id, teacher_id, classroom_id, slot_id, label)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  )
  const flagSlot = slotAt(1, 1)
  let fixedCount = 0
  for (const gid of Object.values(gradeIds)) {
    insFixed.run(sem.id, null, gid, null, null, null, flagSlot.id, '升旗仪式')
    fixedCount += 1
  }
  const meetingSubject = subjectByName.get('班会')
  const meetingSlot = slotAt(1, periodsPerDay)
  for (const k of classes) {
    insFixed.run(
      sem.id,
      k.id,
      null,
      meetingSubject ? meetingSubject.id : null,
      headOf.get(k.id) ?? null,
      null,
      meetingSlot.id,
      '班会'
    )
    fixedCount += 1
  }

  // ── 约束组 ────────────────────────────────────────────────────────
  const insGroup = db.prepare(
    `INSERT INTO constraint_group (semester_id, group_type, name, hardness, max_concurrent, scope_note)
     VALUES (?, ?, ?, ?, ?, ?)`
  )
  const insMember = db.prepare(
    'INSERT OR IGNORE INTO group_member (group_id, member_type, member_id) VALUES (?, ?, ?)'
  )
  let groupCount = 0

  // ① 教师互斥（硬）：两位跨校兼课的教师不可同时段
  const chinesePool = teachersBySubject.get('语文') ?? []
  if (chinesePool.length >= 2) {
    const gid = Number(
      insGroup.run(sem.id, 'teacher_mutex', '跨校兼课教师互斥', 'hard', null, 'same_slot')
        .lastInsertRowid
    )
    insMember.run(gid, 'teacher', chinesePool[0].id)
    insMember.run(gid, 'teacher', chinesePool[1].id)
    groupCount += 1
  }
  // ② 学科互斥（软，并发上限 2）：理化生共用实验楼，同时段最多 2 科
  const labSubjects = ['物理', '化学', '生物'].map((n) => subjectByName.get(n)).filter(Boolean)
  if (labSubjects.length >= 2) {
    const gid = Number(
      insGroup.run(sem.id, 'subject_mutex', '实验楼同时段限流', 'soft', 2, 'same_slot')
        .lastInsertRowid
    )
    for (const s of labSubjects) insMember.run(gid, 'subject', s.id)
    groupCount += 1
  }
  // ③ 合班拼合：初三 19/20 班信息技术合上一节
  const it = subjectByName.get('信息技术')
  if (it) {
    const a = classes.find((c) => c.gradeName === '初三' && c.index === 19)
    const b = classes.find((c) => c.gradeName === '初三' && c.index === 20)
    const ta = a && taskIdByKey.get(`${a.id}:${it.id}`)
    const tb = b && taskIdByKey.get(`${b.id}:${it.id}`)
    if (ta && tb) {
      const gid = Number(
        insGroup.run(sem.id, 'merge', '初三19/20班信息技术拼班', 'hard', null, 'same_slot')
          .lastInsertRowid
      )
      insMember.run(gid, 'task', ta)
      insMember.run(gid, 'task', tb)
      db.prepare('UPDATE teaching_task SET merge_group_id = ? WHERE id IN (?, ?)').run(gid, ta, tb)
      groupCount += 1
    }
  }

  const teacherTotal = [...teachersBySubject.values()].reduce((s, l) => s + l.length, 0)
  const overloaded = [...teachersBySubject.values()]
    .flat()
    .filter((t) => t.load > MAX_WEEKLY).length
  const unassigned = db
    .prepare('SELECT COUNT(*) AS n FROM teaching_task WHERE semester_id = ? AND teacher_id IS NULL')
    .get(sem.id).n

  return {
    学校: '示范初中',
    学期: sem.name,
    年级班级: `3 年级 × ${CLASSES_PER_GRADE} 班 = ${classes.length} 班`,
    教师: `${teacherTotal} 人（上限 ${MAX_WEEKLY} 节/周，超限 ${overloaded} 人）`,
    教学任务: `${taskCount} 条 / ${periodCount} 节每周（未指派 ${unassigned} 条）`,
    时段规则: `${ruleCount} 条`,
    预排占位: `${fixedCount} 条`,
    约束组: `${groupCount} 个`
  }
}

main()
