/* eslint-disable */
/**
 * M2 验收种子：「示范高完中」（高中 + 初中）全量教学任务与规则。
 *
 * 目标 = docs/06 M2 验收标准：**为示范高完中配齐全部教学任务与规则，
 * 数据可完整读出为 SolverInput**。一条命令铺好，便于真机点开 UI 逐项复核。
 *
 * 分层：基础数据（学校/学期/年级班级/教室/教师/班主任）来自 scripts/lib/demo-school.cjs，
 *       与 `npm run seed:test` **共用同一份定义**；本脚本只负责在其之上追加 M2 那一层：
 *
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
 * 幂等：可反复运行得到一致结果。⚠️ 会清空当前学期的年级与规则并重建，
 *       且把 school 单例改写为「示范高完中」、停用小学学段。
 */
const Database = require('better-sqlite3')
const base = require('./lib/demo-school.cjs')
// 退出 / Windows 控制台编码 / electron 与纯 Node 双模式，统一在这里处理
const { runSeed, printSummary } = require('./lib/cli.cjs')

/** 早读只安排语文/英语，其余学科在早读时段一律禁排 */
const MORNING_READING_SUBJECTS = new Set(['语文', '英语'])

function main(app) {
  const dbPath = base.getDbPath(app)
  const db = new Database(dbPath)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  base.runMigrations(db)

  const out = db.transaction(() => seed(db))()
  db.close()

  printSummary(
    '示范高完中 · M2 数据已就绪',
    { ...out, 数据库: dbPath },
    '打开「教学任务」「排课规则 → 输入自检」两页即可验收（顶部可切换初中部/高中部）。'
  )
}

function seed(db) {
  // ── 基础数据（与 seed:test 共用一份定义） ─────────────────────────
  const ctx = base.buildBaseSchool(db)
  const { semesterId, classes, stageInfo, subjectByName, rooms, pools, headOf, gradeIds } = ctx

  // 本学期的规则/预排/约束组全部重建
  db.prepare('DELETE FROM time_rule WHERE semester_id = ?').run(semesterId)
  db.prepare('DELETE FROM fixed_lesson WHERE semester_id = ?').run(semesterId)
  db.prepare('DELETE FROM constraint_group WHERE semester_id = ?').run(semesterId)

  // ── 教学任务：直接落 buildBaseSchool 推导好的「班 × 学科 × 课时 × 教师」 ──
  const insTask = db.prepare(
    `INSERT INTO teaching_task (semester_id, class_id, subject_id, teacher_id, weekly_periods,
                                consecutive_count, consecutive_size, week_mode)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'all')`
  )
  let taskCount = 0
  let periodCount = 0
  const taskIdByKey = new Map()
  for (const a of ctx.assignments) {
    // 连堂（验证 H10 链路）：语文每周一组 2 节写作文；高中信息技术上机整块连上。
    // ⚠️ 连堂总节次不得超过周课时，否则 validateSolverInput 会报 TASK_CONSECUTIVE。
    const wantConsecutive =
      a.subjectName === '语文' || (a.stageCode === 'senior' && a.subjectName === '信息技术')
    const consecutive = wantConsecutive && a.weeklyPeriods >= 2 ? 1 : 0
    const id = Number(
      insTask.run(semesterId, a.classId, a.subjectId, a.teacherId, a.weeklyPeriods, consecutive, 2)
        .lastInsertRowid
    )
    taskIdByKey.set(`${a.classId}:${a.subjectId}`, id)
    taskCount += 1
    periodCount += a.weeklyPeriods
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

  const bindRooms = (subjectName, roomIds) => {
    const s = subjectByName.get(subjectName)
    if (!s) return 0
    db.prepare('DELETE FROM subject_classroom WHERE subject_id = ?').run(s.id)
    const ins = db.prepare(
      `INSERT INTO subject_classroom (subject_id, classroom_id, slots_taken, priority)
       VALUES (?, ?, 1, ?)`
    )
    roomIds.forEach((room, i) => ins.run(s.id, room, roomIds.length - i))
    return roomIds.length
  }
  let roomBindings = 0
  roomBindings += bindRooms('体育', rooms.sports)
  roomBindings += bindRooms('音乐', rooms.music)
  roomBindings += bindRooms('美术', rooms.art)
  roomBindings += bindRooms('信息技术', rooms.computer)
  roomBindings += bindRooms('通用技术', rooms.tech)
  roomBindings += bindRooms('物理', rooms.physics)
  roomBindings += bindRooms('化学', rooms.chemistry)
  roomBindings += bindRooms('生物', rooms.biology)

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
      delGlobal.run(semesterId, slot.id)
      insGlobal.run(semesterId, slot.id, value)
    } else {
      insRule.run(semesterId, scopeType, scopeId, slot.id, value)
    }
    ruleCount += 1
  }

  for (const st of base.STAGES) {
    const { slotAt, roles, days } = stageInfo[st.code]
    const usedSubjects = Object.keys(
      Object.values(st.grades).reduce((acc, plan) => Object.assign(acc, plan), {})
    )

    // 全局：每周最后一节大扫除，避排
    addRule('global', null, slotAt(days, roles.lastLesson), 'AVOID')

    for (let d = 1; d <= days; d++) {
      // 学科：主课优选上午前 3 节正课
      for (const sname of ['语文', '数学', '英语']) {
        const s = subjectByName.get(sname)
        if (!s) continue
        for (const p of roles.morning.slice(0, 3)) {
          addRule('subject', s.id, slotAt(d, p), 'PREFERRED')
        }
      }
      // 学科：体育避排上午第一节、优选下午倒数第二节
      const pe = subjectByName.get('体育')
      if (pe) {
        addRule('subject', pe.id, slotAt(d, roles.firstLesson), 'AVOID')
        addRule(
          'subject',
          pe.id,
          slotAt(d, roles.afternoon[Math.max(0, roles.afternoon.length - 2)]),
          'PREFERRED'
        )
      }
      // 高中早读只留给语文/英语：其余在用学科一律禁排
      for (const p of roles.reading) {
        for (const sname of usedSubjects) {
          if (MORNING_READING_SUBJECTS.has(sname)) continue
          const s = subjectByName.get(sname)
          if (s) addRule('subject', s.id, slotAt(d, p), 'FORBIDDEN')
        }
      }
    }

    // 教师：每个学科的第 1 位教师，周三下午教研，全禁排
    for (const [key, pool] of pools) {
      if (!key.startsWith(`${st.code}|`) || !pool[0]) continue
      for (const p of roles.afternoon) addRule('teacher', pool[0].id, slotAt(3, p), 'FORBIDDEN')
    }

    // 班级：毕业年级周四下午最后两节年级统测，逐班禁排
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
    insFixed.run(semesterId, classId, gradeId, subjectId, teacherId, null, slot.id, label)
    fixedCount += 1
  }
  const meetingSubject = subjectByName.get('班会')

  for (const st of base.STAGES) {
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
      insGroup.run(semesterId, 'teacher_mutex', '初高中部跨部兼课互斥', 'hard', null, 'same_slot')
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
      insGroup.run(semesterId, 'subject_mutex', '实验楼同时段限流', 'soft', 2, 'same_slot')
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
        insGroup.run(semesterId, 'merge', '高一19/20班通用技术拼班', 'hard', null, 'same_slot')
          .lastInsertRowid
      )
      insMember.run(gid, 'task', ta)
      insMember.run(gid, 'task', tb)
      db.prepare('UPDATE teaching_task SET merge_group_id = ? WHERE id IN (?, ?)').run(gid, ta, tb)
      groupCount += 1
    }
  }

  const overloaded = ctx.teachers.filter((t) => t.load > base.MAX_WEEKLY).length
  const unassigned = db
    .prepare('SELECT COUNT(*) AS n FROM teaching_task WHERE semester_id = ? AND teacher_id IS NULL')
    .get(semesterId).n
  const byStage = (code) => ctx.teachers.filter((t) => t.stageCode === code).length

  return {
    学校: `${base.SCHOOL_NAME}（${base.SCHOOL_TYPE}）`,
    学期: ctx.semesterName,
    年级班级: `初中 3 × ${base.CLASSES_PER_GRADE} + 高中 3 × ${base.CLASSES_PER_GRADE} = ${classes.length} 班`,
    教师: `${ctx.teachers.length} 人（初中部 ${byStage('junior')} / 高中部 ${byStage(
      'senior'
    )}，上限 ${base.MAX_WEEKLY} 节，超限 ${overloaded} 人）`,
    教学任务: `${taskCount} 条 / ${periodCount} 节每周（未指派 ${unassigned} 条）`,
    时段规则: `${ruleCount} 条`,
    学科场地: `${roomBindings} 条绑定`,
    预排占位: `${fixedCount} 条（升旗 / 班会 / 高中早读 / 高中晚自习）`,
    约束组: `${groupCount} 个`
  }
}

runSeed(main)
