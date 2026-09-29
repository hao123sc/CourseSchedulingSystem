/* eslint-disable */
/**
 * 基础数据种子（示范高完中 · M1 验收口径）。
 *
 * 用途：往「当前正在使用的开发数据库」灌入一套**基础数据**，验证 M1 的
 *       学校设置 / 学段作息 / 年级班级 / 学科 / 教师 / 教室 六张表与对应页面。
 *
 *   学校    示范高完中（complete = 初中部 + 高中部）
 *   学期    2026-2027学年第一学期（当前）、第二学期
 *   年级班级 初一/初二/初三 + 高一/高二/高三，各 20 班 = 120 班，每班 45 人
 *   教室    120 间班级专属教室（设为 home_room）+ 田径场/篮球场/风雨操场
 *           + 音乐/美术/计算机/通用技术/理化生实验室
 *   教师    按各科课时需求测算编制，初中部/高中部分开建池，人人 ≤18 节/周，
 *           每班一名任教本班的班主任（一师一班）
 *
 * **不含**教学任务与规则——那是 M2 的事，跑 `npm run seed:m2`（它会先铺同一套基础数据）。
 *
 * 运行方式（必须用 electron 跑，才能匹配 better-sqlite3 的原生 ABI）：
 *   npm run seed:test
 * 即 `electron scripts/seed-test-data.cjs`。脚本不开窗口，跑完自动退出。
 *
 * 幂等：可反复运行得到一致结果。⚠️ 会清空当前学期的年级并把 school 单例改写为「示范高完中」。
 * 基础数据的唯一定义在 scripts/lib/demo-school.cjs，与 seed:m2 共用，不会跑偏。
 */
const Database = require('better-sqlite3')
const base = require('./lib/demo-school.cjs')
// 退出 / Windows 控制台编码 / electron 与纯 Node 双模式，统一在这里处理
const { runSeed, printSummary } = require('./lib/cli.cjs')

function main(app) {
  const dbPath = base.getDbPath(app)
  const db = new Database(dbPath)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  base.runMigrations(db)

  const out = db.transaction(() => {
    const built = base.buildBaseSchool(db)
    // 本脚本代表「M1 基础数据层」，因此要把 M2 层（seed:m2 铺的规则类数据）一并清掉，
    // 否则先跑 seed:m2 再跑 seed:test 会留下一堆指向已删年级/班级的孤儿规则。
    // 教学任务与班级级预排由 grade/klass 的级联删除带走，这里补的是不挂在年级下的那几张表。
    db.prepare('DELETE FROM time_rule WHERE semester_id = ?').run(built.semesterId)
    db.prepare('DELETE FROM fixed_lesson WHERE semester_id = ?').run(built.semesterId)
    db.prepare('DELETE FROM constraint_group WHERE semester_id = ?').run(built.semesterId)
    db.prepare('DELETE FROM subject_classroom').run()
    return built
  })()

  const q = (sql, ...a) => db.prepare(sql).get(...a)
  const summary = {
    学校: `${base.SCHOOL_NAME}（${q('SELECT school_type t FROM school WHERE id=1').t}）`,
    学期: db
      .prepare('SELECT name, is_current FROM semester ORDER BY id')
      .all()
      .map((s) => `${s.name}${s.is_current ? '（当前）' : ''}`)
      .join(' / '),
    启用学段: db
      .prepare('SELECT name, days_per_week d FROM stage WHERE enabled=1 ORDER BY sort_order')
      .all()
      .map(
        (s) =>
          `${s.name}(${
            q(
              'SELECT COUNT(*) n FROM time_slot ts JOIN stage st ON st.id=ts.stage_id WHERE st.name=? AND ts.is_teaching=1 AND ts.day_of_week<=st.days_per_week',
              s.name
            ).n
          }槽/周)`
      )
      .join(' '),
    年级班级: db
      .prepare(
        `SELECT g.name grade, COUNT(k.id) n FROM grade g LEFT JOIN klass k ON k.grade_id=g.id
          WHERE g.semester_id=? GROUP BY g.id ORDER BY g.sort_order`
      )
      .all(out.semesterId)
      .map((r) => `${r.grade}×${r.n}`)
      .join(' '),
    班级合计: `${out.classes.length} 班，每班 ${base.STUDENTS_PER_CLASS} 人`,
    教师: `${out.teachers.length} 人（初中部 ${
      out.teachers.filter((t) => t.stageCode === 'junior').length
    } / 高中部 ${out.teachers.filter((t) => t.stageCode === 'senior').length}，上限 ${
      base.MAX_WEEKLY
    } 节/周）`,
    班主任: `${out.headOf.size} 人（均任教本班，一师一班）`,
    教室: `${q("SELECT COUNT(*) n FROM classroom WHERE room_type='normal'").n} 间班级教室 + ${
      q("SELECT COUNT(*) n FROM classroom WHERE room_type<>'normal'").n
    } 处专用场地`,
    固定教室: `${q('SELECT COUNT(*) n FROM klass WHERE home_room_id IS NOT NULL').n} 个班已绑定`,
    共享场地: db
      .prepare(
        "SELECT name, capacity c, concurrent_capacity cc FROM classroom WHERE room_type='sports' ORDER BY id"
      )
      .all()
      .map((r) => `${r.name}(${r.c}人/并发${r.cc}班)`)
      .join(' ')
  }
  db.close()

  printSummary(
    '示范高完中 · 基础数据已就绪',
    { ...summary, 数据库: dbPath },
    '教学任务与规则请跑 npm run seed:m2。'
  )
}

runSeed(main)
