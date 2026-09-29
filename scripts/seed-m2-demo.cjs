/* eslint-disable */
/**
 * M2 验收种子：「示范高完中」（高中 + 初中，school_type = complete）全量教学任务与规则。
 *
 * 目标 = docs/06 M2 验收标准：**为示范高完中配齐全部教学任务与规则，
 * 数据可完整读出为 SolverInput**。一条命令铺好，便于真机点开 UI 逐项复核。
 *
 * 产出：
 *   学校    示范高完中（complete = 初中部 + 高中部，两个学段两套作息同时在跑）
 *   学期    2026-2027学年第一学期（设为当前）
 *   年级班级 初一/初二/初三 + 高一/高二/高三，各 20 班 = 120 班，每班 45 人
 *   教室    120 间班级教室 + 体育/音乐/美术/计算机/通用技术/理化生实验室（按 120 班规模配并发容量）
 *   教师    初中部、高中部分开建池，按各科课时需求自动测算人数，保证人人不超 18 节/周
 *   教学任务 按《义务教育课程方案(2022)》七/八/九年级 +《普通高中课程方案(2017年版2020修订)》
 *           高一/高二/高三 课时方案套用（班会改由预排占位承担）
 *   时段规则 全局/年级/学科/教师/班级五种作用域的示例规则（D4 四层规则值都有覆盖）
 *   学科规则 每日上限 + 分布策略 + 专用场地绑定（体育/音乐/美术/信息技术/通用技术/理化生）
 *   预排锁定 初中：周一第1节升旗 + 周一末节班会
 *           高中：每天早读、每天 3 节晚自习（整年级占位）+ 周一第1节升旗 + 周一末节班会
 *   约束组   教师互斥(hard) / 学科互斥(soft, 并发上限) / 合班拼合(merge)
 *
 * 运行（必须用 electron 跑，匹配 better-sqlite3 的原生 ABI）：
 *   npm run seed:m2
 *
 * 幂等：先清空「当前学期」的年级（级联清掉班级/任务/预排/约束组成员）再重建，
 * 可反复运行得到一致结果。⚠️ 会把 school 单例改写为「示范高完中」。
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

/**
 * 课时方案（与 src/shared/curriculumPresets.ts 的初中三套 + 高中三套逐科一致，
 * 唯一差别是去掉「班会」——班会改由 fixed_lesson 预排占位承担，避免同一节课被算两遍）。
 */
const STAGES = [
  {
    code: 'junior',
    label: '初中部',
    prefix: '初',
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
    prefix: '高',
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

const CLASSES_PER_GRADE = 20
const STUDENTS_PER_CLASS = 45
const MAX_WEEKLY = 18
/** 早读只安排语文/英语，其余学科在早读时段一律禁排 */
const MORNING_READING_SUBJECTS = new Set(['语文', '英语'])

function main() {
  const dbPath = getDbPath()
  const db = new Database(dbPath)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  runMigrations(db)

  const out = db.transaction(() => seed(db))()
  db.close()

  console.log('\n===== 示范高完中 · M2 数据已就绪 =====')
  for (const [k, v] of Object.entries(out)) console.log(`  ${k.padEnd(14)} ${v}`)
  console.log(`  数据库          ${dbPath}`)
  console.log('\n打开「教学任务」「排课规则 → 输入自检」两页即可验收（顶部可切换初中部/高中部）。')
}

function seed(db) {
  // ── 学校 / 学期 ───────────────────────────────────────────────────
  db.prepare(
    `INSERT INTO school (id, name, school_type) VALUES (1, ?, 'complete')
     ON CONFLICT(id) DO UPDATE SET name = excluded.name, school_type = excluded.school_type`
  ).run('示范高完中')

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
  // 高完中只用初中/高中两个学段，小学停用（不删，避免影响别的演示数据）
  db.prepare(`UPDATE stage SET enabled = 1 WHERE code IN ('junior','senior')`).run()
  db.prepare(`UPDATE stage SET enabled = 0 WHERE code = 'primary'`).run()

  const subjects = db.prepare('SELECT * FROM subject').all()
  const subjectByName = new Map(subjects.map((s) => [s.name, s]))

  // ── 教室与场地（按 120 班规模配并发容量） ─────────────────────────
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

  const sharedRooms = {
    // docs/03 §5「场地配置」：田径场 800/4、篮球场 150/3、风雨操场 300/2
    sports: [
      upsertRoom('田径场', 'sports', 800, 4, '室外'),
      upsertRoom('篮球场', 'sports', 150, 3, '室外'),
      upsertRoom('风雨操场', 'sports', 300, 2, 'B栋')
    ],
    music: multi('音乐教室', 3, 'music', 50, 1, 'C栋'),
    art: multi('美术教室', 3, 'art', 50, 1, 'C栋'),
    computer: multi('计算机房', 4, 'computer', 60, 1, 'D栋'),
    tech: multi('通用技术室', 2, 'other', 50, 1, 'D栋'),
    physics: multi('物理实验室', 2, 'lab', 48, 1, 'E栋'),
    chemistry: multi('化学实验室', 2, 'lab', 48, 1, 'E栋'),
    biology: multi('生物实验室', 2, 'lab', 48, 1, 'E栋')
  }

  // ── 逐学段建 年级 / 班级 / 班级教室，并解析该学段的作息角色 ────────
  const classes = [] // { id, stageCode, gradeName, gradeId, index, name }
  const gradeIds = {} // gradeName -> id
  const stageInfo = {} // stageCode -> { row, slots, slotAt, roles }
  let sortOrder = 0

  for (const st of STAGES) {
    const row = db.prepare('SELECT * FROM stage WHERE code = ?').get(st.code)
    const slots = db
      .prepare(
        `SELECT * FROM time_slot WHERE stage_id = ? AND day_of_week <= ? AND is_teaching = 1
          ORDER BY day_of_week, period_index`
      )
      .all(row.id, row.days_per_week)
    const slotAt = (day, period) =>
      slots.find((s) => s.day_of_week === day && s.period_index === period)
    const day1 = slots.filter((s) => s.day_of_week === 1)
    // 作息角色：早读 / 上午正课 / 下午正课 / 晚自习，全部从库里的 segment + period_name 推导，
    // 不写死节次编号——用户改过作息后脚本依然成立。
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
          .run(sem.id, row.id, gradeName, 2026, sortOrder).lastInsertRowid
      )
      gradeIds[gradeName] = gid
      for (let i = 1; i <= CLASSES_PER_GRADE; i++) {
        const name = `${gradeName}(${i})班`
        const roomId = upsertRoom(
          `${name}教室`,
          'normal',
          50,
          1,
          st.code === 'junior' ? 'A栋' : 'F栋'
        )
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

  // ── 教师：初中部 / 高中部分开建池 ─────────────────────────────────
  db.prepare(`DELETE FROM teacher WHERE staff_no LIKE 'M2%'`).run()
  const pools = new Map() // `${stageCode}|${subjectName}` -> [{id, load, classes}]
  let staffSeq = 0
  const hireTeacher = (stageCode, sname) => {
    const st = STAGES.find((s) => s.code === stageCode)
    const subject = subjectByName.get(sname)
    if (!subject) return null
    const key = `${stageCode}|${sname}`
    const list = pools.get(key) ?? []
    const seq = list.length + 1
    staffSeq += 1
    const tid = Number(
      db
        .prepare(
          `INSERT INTO teacher (name, staff_no, max_weekly_periods, building)
           VALUES (?, ?, ?, ?)`
        )
        .run(
          `${st.prefix}${sname}${String(seq).padStart(2, '0')}`,
          `M2${String(staffSeq).padStart(4, '0')}`,
          MAX_WEEKLY,
          stageCode === 'junior' ? 'A栋' : 'F栋'
        ).lastInsertRowid
    )
    db.prepare('INSERT OR IGNORE INTO teacher_subject (teacher_id, subject_id) VALUES (?, ?)').run(
      tid,
      subject.id
    )
    const t = { id: tid, stageCode, subject: sname, load: 0, classes: [] }
    list.push(t)
    pools.set(key, list)
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
      // 预估人数：整班课时不可拆分，按「一人最多带几个整班」向下取整算容量，避免尾数凑不满
      const maxOfOneClass = Math.max(...Object.values(st.grades).map((p) => p[sname] ?? 0))
      const perTeacher = Math.max(1, Math.floor(MAX_WEEKLY / maxOfOneClass) * maxOfOneClass)
      const need = Math.ceil(total / perTeacher)
      for (let i = 1; i <= need; i++) hireTeacher(st.code, sname)
    }
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
    const st = STAGES.find((s) => s.code === k.stageCode)
    const plan = st.grades[k.gradeName]
    for (const [sname, periods] of Object.entries(plan)) {
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
      // 连堂（验证 H10 链路）：语文每周一组 2 节写作文；高中信息技术上机整块连上。
      // ⚠️ 连堂总节次不得超过周课时，否则 validateSolverInput 会报 TASK_CONSECUTIVE。
      const wantConsecutive = sname === '语文' || (k.stageCode === 'senior' && sname === '信息技术')
      const consecutive = wantConsecutive && periods >= 2 ? 1 : 0
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
    '物理',
    '化学',
    '生物',
    '政治',
    '道德与法治',
    '历史',
    '地理'
  ]
  const usedHeads = new Set()
  const headOf = new Map()
  for (const k of classes) {
    let chosen = null
    for (const sname of HEAD_PRIORITY) {
      const pool = pools.get(`${k.stageCode}|${sname}`) ?? []
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
  for (const n of ['语文', '数学', '英语']) setSubjectRule(n, 2, 'spread', false)
  for (const n of ['物理', '化学', '生物', '政治', '历史', '地理', '道德与法治'])
    setSubjectRule(n, 2, 'spread', false)
  setSubjectRule('体育', 1, 'spread', true)
  setSubjectRule('音乐', 1, 'spread', true)
  setSubjectRule('美术', 1, 'spread', true)
  setSubjectRule('信息技术', 1, 'spread', true)
  setSubjectRule('通用技术', 2, 'concentrate', true)
  setSubjectRule('综合实践', 2, 'concentrate', false)
  setSubjectRule('劳动', 1, 'spread', false)

  const bindRooms = (subjectName, bindings) => {
    const s = subjectByName.get(subjectName)
    if (!s) return 0
    db.prepare('DELETE FROM subject_classroom WHERE subject_id = ?').run(s.id)
    const ins = db.prepare(
      `INSERT INTO subject_classroom (subject_id, classroom_id, slots_taken, priority)
       VALUES (?, ?, ?, ?)`
    )
    bindings.forEach((b, i) =>
      ins.run(s.id, b.room, b.slots ?? 1, b.priority ?? bindings.length - i)
    )
    return bindings.length
  }
  let roomBindings = 0
  roomBindings += bindRooms(
    '体育',
    sharedRooms.sports.map((room) => ({ room }))
  )
  roomBindings += bindRooms(
    '音乐',
    sharedRooms.music.map((room) => ({ room }))
  )
  roomBindings += bindRooms(
    '美术',
    sharedRooms.art.map((room) => ({ room }))
  )
  roomBindings += bindRooms(
    '信息技术',
    sharedRooms.computer.map((room) => ({ room }))
  )
  roomBindings += bindRooms(
    '通用技术',
    sharedRooms.tech.map((room) => ({ room }))
  )
  roomBindings += bindRooms(
    '物理',
    sharedRooms.physics.map((room) => ({ room }))
  )
  roomBindings += bindRooms(
    '化学',
    sharedRooms.chemistry.map((room) => ({ room }))
  )
  roomBindings += bindRooms(
    '生物',
    sharedRooms.biology.map((room) => ({ room }))
  )

  // ── 四层时段规则（D4）：五种作用域都铺一点，四个规则值都用上 ─────────
  const insRule = db.prepare(
    `INSERT OR REPLACE INTO time_rule (semester_id, scope_type, scope_id, slot_id, rule_value)
     VALUES (?, ?, ?, ?, ?)`
  )
  const delGlobal = db.prepare(
    `DELETE FROM time_rule WHERE semester_id=? AND scope_type='global' AND scope_id IS NULL AND slot_id=?`
  )
  const insGlobal = db.prepare(
    `INSERT INTO time_rule (semester_id, scope_type, scope_id, slot_id, rule_value)
     VALUES (?, 'global', NULL, ?, ?)`
  )
  let ruleCount = 0
  const addRule = (scopeType, scopeId, slot, value) => {
    if (!slot) return
    // global 的 scope_id 恒为 NULL，唯一性由 005 的条件唯一索引 ux_time_rule_global 保证
    if (scopeType === 'global') {
      delGlobal.run(sem.id, slot.id)
      insGlobal.run(sem.id, slot.id, value)
    } else {
      insRule.run(sem.id, scopeType, scopeId, slot.id, value)
    }
    ruleCount += 1
  }

  for (const st of STAGES) {
    const { slotAt, roles, days } = stageInfo[st.code]

    // 全局：每周最后一节大扫除，避排
    addRule('global', null, slotAt(days, roles.lastLesson), 'AVOID')

    // 学科：主课优选上午前 3 节正课；体育避排上午第一节、优选下午倒数第二节
    for (let d = 1; d <= days; d++) {
      for (const sname of ['语文', '数学', '英语']) {
        const s = subjectByName.get(sname)
        if (!s) continue
        for (const p of roles.morning.slice(0, 3))
          addRule('subject', s.id, slotAt(d, p), 'PREFERRED')
      }
      const pe = subjectByName.get('体育')
      if (pe) {
        addRule('subject', pe.id, slotAt(d, roles.firstLesson), 'AVOID')
        const pref = roles.afternoon[Math.max(0, roles.afternoon.length - 2)]
        addRule('subject', pe.id, slotAt(d, pref), 'PREFERRED')
      }
      // 高中早读只留给语文/英语：其余在用学科一律禁排
      for (const p of roles.reading) {
        for (const sname of Object.keys(
          Object.values(st.grades).reduce((acc, plan) => Object.assign(acc, plan), {})
        )) {
          if (MORNING_READING_SUBJECTS.has(sname)) continue
          const s = subjectByName.get(sname)
          if (s) addRule('subject', s.id, slotAt(d, p), 'FORBIDDEN')
        }
      }
    }

    // 教师：每个学科的第 1 位教师，周三下午教研，全禁排
    for (const [key, pool] of pools) {
      if (!key.startsWith(`${st.code}|`)) continue
      const t = pool[0]
      if (!t) continue
      for (const p of roles.afternoon) addRule('teacher', t.id, slotAt(3, p), 'FORBIDDEN')
    }

    // 年级：毕业年级周四下午最后两节年级统测，整年级禁排（班级作用域逐班下发）
    const gradeNames = Object.keys(st.grades)
    const examGrade = gradeNames[gradeNames.length - 1]
    for (const k of classes.filter((c) => c.gradeName === examGrade)) {
      for (const p of roles.afternoon.slice(-2)) addRule('class', k.id, slotAt(4, p), 'FORBIDDEN')
    }
    // 年级：起始年级周一第二节年级例会，避排
    addRule('grade', gradeIds[gradeNames[0]], slotAt(1, roles.morning[1]), 'AVOID')
  }

  // ── 预排锁定 ──────────────────────────────────────────────────────
  const insFixed = db.prepare(
    `INSERT INTO fixed_lesson (semester_id, class_id, grade_id, subject_id, teacher_id, classroom_id, slot_id, label)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  )
  let fixedCount = 0
  const addFixed = (classId, gradeId, subjectId, teacherId, slot, label) => {
    if (!slot) return
    insFixed.run(sem.id, classId, gradeId, subjectId, teacherId, null, slot.id, label)
    fixedCount += 1
  }
  const meetingSubject = subjectByName.get('班会')

  for (const st of STAGES) {
    const { slotAt, roles, days } = stageInfo[st.code]
    for (const gradeName of Object.keys(st.grades)) {
      const gid = gradeIds[gradeName]
      // 升旗仪式：周一第一节正课（高中在早读之后）
      addFixed(null, gid, null, null, slotAt(1, roles.firstLesson), '升旗仪式')
      // 高中：每天早读 + 每天 3 节晚自习，整年级占位
      for (let d = 1; d <= days; d++) {
        for (const p of roles.reading) addFixed(null, gid, null, null, slotAt(d, p), '早读')
        for (const p of roles.evening) addFixed(null, gid, null, null, slotAt(d, p), '晚自习')
      }
    }
    // 班会：周一末节正课，班主任带
    for (const k of classes.filter((c) => c.stageCode === st.code)) {
      addFixed(
        k.id,
        null,
        meetingSubject ? meetingSubject.id : null,
        headOf.get(k.id) ?? null,
        slotAt(1, roles.lastLesson),
        '班会'
      )
    }
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

  // ① 教师互斥（硬）：初高中部各抽一位跨部兼课的语文教师，不可同时段
  const jc = pools.get('junior|语文') ?? []
  const sc = pools.get('senior|语文') ?? []
  if (jc.length && sc.length) {
    const gid = Number(
      insGroup.run(sem.id, 'teacher_mutex', '初高中部跨部兼课互斥', 'hard', null, 'same_slot')
        .lastInsertRowid
    )
    insMember.run(gid, 'teacher', jc[0].id)
    insMember.run(gid, 'teacher', sc[0].id)
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
  // ③ 合班拼合：高一 19/20 班通用技术合上一节（小班额学科拼班）
  const tech = subjectByName.get('通用技术')
  if (tech) {
    const a = classes.find((c) => c.gradeName === '高一' && c.index === 19)
    const b = classes.find((c) => c.gradeName === '高一' && c.index === 20)
    const ta = a && taskIdByKey.get(`${a.id}:${tech.id}`)
    const tb = b && taskIdByKey.get(`${b.id}:${tech.id}`)
    if (ta && tb) {
      const gid = Number(
        insGroup.run(sem.id, 'merge', '高一19/20班通用技术拼班', 'hard', null, 'same_slot')
          .lastInsertRowid
      )
      insMember.run(gid, 'task', ta)
      insMember.run(gid, 'task', tb)
      db.prepare('UPDATE teaching_task SET merge_group_id = ? WHERE id IN (?, ?)').run(gid, ta, tb)
      groupCount += 1
    }
  }

  const allTeachers = [...pools.values()].flat()
  const overloaded = allTeachers.filter((t) => t.load > MAX_WEEKLY).length
  const unassigned = db
    .prepare('SELECT COUNT(*) AS n FROM teaching_task WHERE semester_id = ? AND teacher_id IS NULL')
    .get(sem.id).n
  const byStage = (code) => allTeachers.filter((t) => t.stageCode === code).length

  return {
    学校: '示范高完中（complete）',
    学期: sem.name,
    年级班级: `初中 3 × ${CLASSES_PER_GRADE} + 高中 3 × ${CLASSES_PER_GRADE} = ${classes.length} 班`,
    教师: `${allTeachers.length} 人（初中部 ${byStage('junior')} / 高中部 ${byStage('senior')}，上限 ${MAX_WEEKLY} 节，超限 ${overloaded} 人）`,
    教学任务: `${taskCount} 条 / ${periodCount} 节每周（未指派 ${unassigned} 条）`,
    时段规则: `${ruleCount} 条`,
    学科场地: `${roomBindings} 条绑定`,
    预排占位: `${fixedCount} 条（升旗 / 班会 / 高中早读 / 高中晚自习）`,
    约束组: `${groupCount} 个`
  }
}

main()
