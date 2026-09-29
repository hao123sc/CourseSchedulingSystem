/* eslint-disable */
/**
 * 测试数据种子脚本（xxx中学 · 完全中学）。
 *
 * 用途：往「当前正在使用的开发数据库」灌入一套测试数据，方便验证 M1 及后续里程碑。
 *   - 学校：xxx中学（完全中学 complete）
 *   - 学期：第一学期 2026-09-01~2027-01-10（当前）、第二学期 2027-03-01~2027-07-01
 *   - 年级：初一/初二/初三 + 高一/高二/高三，每年级 20 班、每班 45 人（共 120 班）
 *   - 体育场地：田径场（concurrent_capacity=5，最多 5 个班同时上）
 *
 * 运行方式（必须用 electron 跑，才能匹配 better-sqlite3 的原生 ABI）：
 *   npm run seed:test
 * 即 `electron scripts/seed-test-data.cjs`。脚本不开窗口，跑完自动退出。
 *
 * 幂等：会先清空「当前学期」下的年级(级联清空其班级/任务/课表)再重建，可反复运行得到一致结果；
 * 学校、学期、田径场按名称去重，不会重复插入。迁移未应用时会自动应用 001~004。
 */
const path = require('path')
const fs = require('fs')
const { app } = require('electron')
const Database = require('better-sqlite3')

function getDbPath() {
  // 与 src/main/db/connection.ts 完全一致：dev 用仓库内 .local-data/data.db
  const dir = app.isPackaged ? app.getPath('userData') : path.join(app.getAppPath(), '.local-data')
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  return path.join(dir, 'data.db')
}

const MIGRATIONS = [
  { version: 1, file: '001_init.sql' },
  { version: 2, file: '002_seed_stages.sql' },
  { version: 3, file: '003_seed_subjects.sql' },
  { version: 4, file: '004_seed_weights.sql' }
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
  const dir = path.join(app.getAppPath(), 'src', 'main', 'db', 'migrations')
  for (const m of MIGRATIONS) {
    if (applied.has(m.version)) continue
    const sql = fs.readFileSync(path.join(dir, m.file), 'utf-8')
    db.transaction(() => {
      db.exec(sql)
      record.run(m.version)
    })()
  }
}

function upsertSchool(db) {
  db.prepare(
    `INSERT INTO school (id, name, school_type) VALUES (1, ?, 'complete')
     ON CONFLICT(id) DO UPDATE SET name = excluded.name, school_type = excluded.school_type`
  ).run('xxx中学')
}

function ensureSemester(db, name, start, end) {
  const existing = db.prepare('SELECT id FROM semester WHERE name = ?').get(name)
  if (existing) {
    db.prepare('UPDATE semester SET start_date = ?, end_date = ? WHERE id = ?').run(
      start,
      end,
      existing.id
    )
    return existing.id
  }
  const info = db
    .prepare('INSERT INTO semester (name, start_date, end_date, is_current) VALUES (?, ?, ?, 0)')
    .run(name, start, end)
  return Number(info.lastInsertRowid)
}

function setCurrent(db, semesterId) {
  db.transaction(() => {
    db.prepare('UPDATE semester SET is_current = 0 WHERE is_current = 1').run()
    db.prepare('UPDATE semester SET is_current = 1 WHERE id = ?').run(semesterId)
  })()
}

function stageIdByCode(db, code) {
  const row = db.prepare('SELECT id FROM stage WHERE code = ?').get(code)
  if (!row) throw new Error(`缺少内置学段 code=${code}，请先启动一次应用生成内置种子`)
  return row.id
}

function ensureSportsField(db) {
  const existing = db.prepare("SELECT id FROM classroom WHERE name = '田径场'").get()
  if (existing) {
    db.prepare(
      'UPDATE classroom SET room_type=?, capacity=?, concurrent_capacity=?, enabled=1 WHERE id=?'
    ).run('sports', 1000, 5, existing.id)
    return existing.id
  }
  const info = db
    .prepare(
      `INSERT INTO classroom (name, room_type, capacity, concurrent_capacity, building, enabled)
       VALUES ('田径场', 'sports', 1000, 5, '运动区', 1)`
    )
    .run()
  return Number(info.lastInsertRowid)
}

function main() {
  const dbPath = getDbPath()
  const db = new Database(dbPath)
  db.pragma('foreign_keys = ON')
  runMigrations(db)

  const STUDENTS = 45
  const CLASSES_PER_GRADE = 20
  const grades = [
    { name: '初一', code: 'junior' },
    { name: '初二', code: 'junior' },
    { name: '初三', code: 'junior' },
    { name: '高一', code: 'senior' },
    { name: '高二', code: 'senior' },
    { name: '高三', code: 'senior' }
  ]

  const tx = db.transaction(() => {
    upsertSchool(db)
    const sem1 = ensureSemester(db, '2026-2027学年第一学期', '2026-09-01', '2027-01-10')
    ensureSemester(db, '2026-2027学年第二学期', '2027-03-01', '2027-07-01')
    setCurrent(db, sem1)

    // 幂等：清空当前学期已有年级（级联删除其班级等），再重建
    db.prepare('DELETE FROM grade WHERE semester_id = ?').run(sem1)

    const insGrade = db.prepare(
      'INSERT INTO grade (semester_id, stage_id, name, sort_order) VALUES (?, ?, ?, ?)'
    )
    const insClass = db.prepare(
      'INSERT INTO klass (grade_id, name, short_name, student_count, is_virtual, sort_order) VALUES (?, ?, ?, ?, 0, ?)'
    )
    let classCount = 0
    grades.forEach((g, gi) => {
      const stageId = stageIdByCode(db, g.code)
      const gradeId = Number(insGrade.run(sem1, stageId, g.name, gi + 1).lastInsertRowid)
      for (let i = 1; i <= CLASSES_PER_GRADE; i++) {
        insClass.run(gradeId, `${g.name}(${i})班`, `${i}班`, STUDENTS, i)
        classCount++
      }
    })

    ensureSportsField(db)
    return { sem1, classCount }
  })

  const { classCount } = tx()

  // 汇总
  const summary = {
    db: dbPath,
    school: db.prepare('SELECT name, school_type FROM school WHERE id=1').get(),
    semesters: db
      .prepare('SELECT name, start_date, end_date, is_current FROM semester ORDER BY id')
      .all(),
    grades: db
      .prepare(
        `SELECT g.name AS grade, COUNT(k.id) AS classes
         FROM grade g LEFT JOIN klass k ON k.grade_id=g.id
         WHERE g.semester_id=(SELECT id FROM semester WHERE is_current=1)
         GROUP BY g.id ORDER BY g.sort_order`
      )
      .all(),
    totalClasses: classCount,
    sportsField: db
      .prepare("SELECT name, capacity, concurrent_capacity FROM classroom WHERE name='田径场'")
      .get()
  }
  db.close()

  console.log('\n✅ 测试数据已写入：', summary.db)
  console.log('学校：', summary.school.name, `(${summary.school.school_type})`)
  console.log('学期：')
  for (const s of summary.semesters) {
    console.log(`  - ${s.name}  ${s.start_date}~${s.end_date}${s.is_current ? '  【当前】' : ''}`)
  }
  console.log('年级/班级（当前学期）：')
  for (const g of summary.grades) console.log(`  - ${g.grade}: ${g.classes} 班`)
  console.log(`共 ${summary.totalClasses} 个班，每班 ${45} 人`)
  console.log(
    `体育场地：${summary.sportsField.name}  座位${summary.sportsField.capacity}  最多 ${summary.sportsField.concurrent_capacity} 个班同时上`
  )
  console.log('\n提示：应用中「基础数据」页若已打开请刷新（切走再切回标签）即可看到。\n')
}

app.whenReady().then(() => {
  try {
    main()
    app.exit(0)
  } catch (e) {
    console.error('\n❌ 种子失败：', e && e.message ? e.message : e)
    app.exit(1)
  }
})
