import { getDb } from '../db/connection'
import { buildSolverInput, checkSolverInput } from './solverInputService'
import { saveSchedule } from './scheduleResultService'
import { solve, toPlacedLessons } from '@solver/solve'
import type { PresetLoadResult } from '@shared/types/ipc'
import type { WeekMode } from '@shared/domain'

/**
 * 十二年一贯制 240 班全功能验收数据。
 *
 * 设计目标：
 *  - 12 年级 × 20 班 × 54 人，正好压到 D2 的 240 班设计容量；
 *  - 教师数与学科周课时按用户确认的工作量口径配置；
 *  - 三学段资源严格分池，避免不同学段独立时段轴造成跨学段资源漏判；
 *  - 同时覆盖实验课、专用场地、并发场地、连堂、单双周、预排、四层规则和约束组；
 *  - 生成三个可比较版本，其中均衡方案设为正式版本。
 */

const SCHOOL_NAME = '智课排十二年一贯制实验学校（全功能测试校）'
const SEMESTER_NAME = '2026-2027学年第一学期'
const CLASSES_PER_GRADE = 20
const STUDENTS_PER_CLASS = 54

const SURNAMES = [
  '李',
  '王',
  '张',
  '刘',
  '陈',
  '杨',
  '赵',
  '黄',
  '周',
  '吴',
  '徐',
  '孙',
  '胡',
  '朱',
  '高',
  '林',
  '何',
  '郭',
  '马',
  '罗'
]
const GIVEN_NAMES = [
  '伟',
  '芳',
  '娜',
  '秀英',
  '敏',
  '静',
  '丽',
  '强',
  '磊',
  '军',
  '洋',
  '勇',
  '艳',
  '杰',
  '娟',
  '涛',
  '明',
  '超',
  '秀兰',
  '霞',
  '平',
  '刚',
  '桂英',
  '英',
  '华',
  '婷',
  '慧',
  '巧',
  '美',
  '玲'
]

const CUSTOM_SUBJECTS = [
  { name: '小学科学实验', shortName: '科实', color: '#16A34A', stage: 'primary', importance: 3 },
  { name: '初中物理实验', shortName: '物实', color: '#2563EB', stage: 'junior', importance: 4 },
  { name: '初中化学实验', shortName: '化实', color: '#D97706', stage: 'junior', importance: 4 },
  { name: '初中生物实验', shortName: '生实', color: '#65A30D', stage: 'junior', importance: 3 },
  { name: '高中物理实验', shortName: '物实', color: '#1D4ED8', stage: 'senior', importance: 4 },
  { name: '高中化学实验', shortName: '化实', color: '#B45309', stage: 'senior', importance: 4 },
  { name: '高中生物实验', shortName: '生实', color: '#4D7C0F', stage: 'senior', importance: 3 },
  { name: '机器人项目', shortName: '机器', color: '#0891B2', stage: 'senior', importance: 2 },
  { name: '创客项目', shortName: '创客', color: '#0E7490', stage: 'senior', importance: 2 }
] as const

type StageCode = 'primary' | 'junior' | 'senior'

interface CurriculumEntry {
  subject: string
  periods: number
}

interface GradeSpec {
  stage: StageCode
  name: string
  building: string
  entries: CurriculumEntry[]
}

const GRADE_SPECS: GradeSpec[] = [
  ...['一年级', '二年级'].map((name) => ({
    stage: 'primary' as const,
    name,
    building: '小学低年级教学楼',
    entries: [
      ['语文', 8],
      ['数学', 4],
      ['体育', 4],
      ['道德与法治', 2],
      ['音乐', 2],
      ['美术', 2],
      ['科学', 1],
      ['劳动', 1],
      ['综合实践', 1]
    ].map(([subject, periods]) => ({ subject: String(subject), periods: Number(periods) }))
  })),
  ...['三年级', '四年级', '五年级', '六年级'].map((name, index) => ({
    stage: 'primary' as const,
    name,
    building: index === 0 ? '小学低年级教学楼' : '小学高年级教学楼',
    entries: [
      ['语文', 7],
      ['数学', 5],
      ['英语', 3],
      ['体育', 3],
      ['道德与法治', 2],
      ['科学', 1],
      ['小学科学实验', 1],
      ['音乐', 2],
      ['美术', 2],
      ['信息技术', 1],
      ['劳动', 1],
      ['综合实践', 1]
    ].map(([subject, periods]) => ({ subject: String(subject), periods: Number(periods) }))
  })),
  {
    stage: 'junior',
    name: '初一',
    building: '初中教学楼',
    entries: [
      ['语文', 5],
      ['数学', 5],
      ['英语', 4],
      ['体育', 3],
      ['道德与法治', 2],
      ['历史', 2],
      ['地理', 2],
      ['生物', 1],
      ['初中生物实验', 1],
      ['音乐', 1],
      ['美术', 1],
      ['信息技术', 1],
      ['劳动', 1],
      ['综合实践', 1]
    ].map(([subject, periods]) => ({ subject: String(subject), periods: Number(periods) }))
  },
  {
    stage: 'junior',
    name: '初二',
    building: '初中教学楼',
    entries: [
      ['语文', 5],
      ['数学', 5],
      ['英语', 4],
      ['体育', 3],
      ['物理', 1],
      ['初中物理实验', 1],
      ['道德与法治', 2],
      ['历史', 2],
      ['地理', 2],
      ['生物', 1],
      ['初中生物实验', 1],
      ['音乐', 1],
      ['美术', 1],
      ['信息技术', 1],
      ['劳动', 1],
      ['综合实践', 1]
    ].map(([subject, periods]) => ({ subject: String(subject), periods: Number(periods) }))
  },
  {
    stage: 'junior',
    name: '初三',
    building: '初中教学楼',
    entries: [
      ['语文', 5],
      ['数学', 5],
      ['英语', 5],
      ['物理', 2],
      ['初中物理实验', 1],
      ['化学', 2],
      ['初中化学实验', 1],
      ['体育', 3],
      ['道德与法治', 2],
      ['历史', 2],
      ['音乐', 1],
      ['美术', 1],
      ['信息技术', 1],
      ['劳动', 1]
    ].map(([subject, periods]) => ({ subject: String(subject), periods: Number(periods) }))
  },
  {
    stage: 'senior',
    name: '高一',
    building: '高中教学楼',
    entries: [
      ['语文', 4],
      ['数学', 4],
      ['英语', 4],
      ['物理', 1],
      ['高中物理实验', 1],
      ['化学', 1],
      ['高中化学实验', 1],
      ['生物', 1],
      ['高中生物实验', 1],
      ['政治', 2],
      ['历史', 2],
      ['地理', 2],
      ['信息技术', 2],
      ['体育', 2],
      ['通用技术', 1],
      ['音乐', 1],
      ['美术', 1],
      ['劳动', 1],
      ['综合实践', 1]
    ].map(([subject, periods]) => ({ subject: String(subject), periods: Number(periods) }))
  },
  {
    stage: 'senior',
    name: '高二',
    building: '高中教学楼',
    entries: [
      ['语文', 4],
      ['数学', 4],
      ['英语', 4],
      ['物理', 2],
      ['高中物理实验', 1],
      ['化学', 2],
      ['高中化学实验', 1],
      ['生物', 2],
      ['高中生物实验', 1],
      ['政治', 3],
      ['历史', 3],
      ['地理', 3],
      ['体育', 2],
      ['信息技术', 1]
    ].map(([subject, periods]) => ({ subject: String(subject), periods: Number(periods) }))
  },
  {
    stage: 'senior',
    name: '高三',
    building: '高中教学楼',
    entries: [
      ['语文', 5],
      ['数学', 5],
      ['英语', 5],
      ['物理', 2],
      ['高中物理实验', 1],
      ['化学', 2],
      ['高中化学实验', 1],
      ['生物', 2],
      ['高中生物实验', 1],
      ['政治', 3],
      ['历史', 3],
      ['地理', 3],
      ['体育', 2]
    ].map(([subject, periods]) => ({ subject: String(subject), periods: Number(periods) }))
  }
]

interface PoolSpec {
  key: string
  stage: StageCode
  count: number
  max: number
  subjects: string[]
  building: string
}

const POOL_SPECS: PoolSpec[] = [
  {
    key: 'p-chinese',
    stage: 'primary',
    count: 60,
    max: 16,
    subjects: ['语文'],
    building: '小学部教师中心'
  },
  {
    key: 'p-math',
    stage: 'primary',
    count: 37,
    max: 16,
    subjects: ['数学'],
    building: '小学部教师中心'
  },
  {
    key: 'p-english',
    stage: 'primary',
    count: 16,
    max: 16,
    subjects: ['英语'],
    building: '小学部教师中心'
  },
  {
    key: 'p-morality',
    stage: 'primary',
    count: 15,
    max: 18,
    subjects: ['道德与法治'],
    building: '小学部教师中心'
  },
  {
    key: 'p-science',
    stage: 'primary',
    count: 12,
    max: 18,
    subjects: ['科学', '小学科学实验'],
    building: '小学科学楼'
  },
  { key: 'p-pe', stage: 'primary', count: 20, max: 20, subjects: ['体育'], building: '小学运动区' },
  {
    key: 'p-music',
    stage: 'primary',
    count: 12,
    max: 20,
    subjects: ['音乐'],
    building: '小学艺术楼'
  },
  {
    key: 'p-art',
    stage: 'primary',
    count: 12,
    max: 20,
    subjects: ['美术'],
    building: '小学艺术楼'
  },
  {
    key: 'p-it',
    stage: 'primary',
    count: 4,
    max: 20,
    subjects: ['信息技术'],
    building: '小学科学楼'
  },
  {
    key: 'p-labor',
    stage: 'primary',
    count: 6,
    max: 20,
    subjects: ['劳动'],
    building: '小学实践楼'
  },
  {
    key: 'p-project',
    stage: 'primary',
    count: 6,
    max: 20,
    subjects: ['综合实践'],
    building: '小学实践楼'
  },

  {
    key: 'j-chinese',
    stage: 'junior',
    count: 30,
    max: 12,
    subjects: ['语文'],
    building: '初中教学楼'
  },
  {
    key: 'j-math',
    stage: 'junior',
    count: 30,
    max: 12,
    subjects: ['数学'],
    building: '初中教学楼'
  },
  {
    key: 'j-english',
    stage: 'junior',
    count: 24,
    max: 12,
    subjects: ['英语'],
    building: '初中教学楼'
  },
  {
    key: 'j-physics',
    stage: 'junior',
    count: 8,
    max: 14,
    subjects: ['物理', '初中物理实验'],
    building: '初中实验楼'
  },
  {
    key: 'j-chemistry',
    stage: 'junior',
    count: 5,
    max: 14,
    subjects: ['化学', '初中化学实验'],
    building: '初中实验楼'
  },
  {
    key: 'j-morality',
    stage: 'junior',
    count: 9,
    max: 14,
    subjects: ['道德与法治'],
    building: '初中教学楼'
  },
  {
    key: 'j-history',
    stage: 'junior',
    count: 9,
    max: 14,
    subjects: ['历史'],
    building: '初中教学楼'
  },
  {
    key: 'j-geography',
    stage: 'junior',
    count: 6,
    max: 14,
    subjects: ['地理'],
    building: '初中教学楼'
  },
  {
    key: 'j-biology',
    stage: 'junior',
    count: 6,
    max: 14,
    subjects: ['生物', '初中生物实验'],
    building: '初中实验楼'
  },
  { key: 'j-pe', stage: 'junior', count: 12, max: 16, subjects: ['体育'], building: '初中运动区' },
  {
    key: 'j-music',
    stage: 'junior',
    count: 4,
    max: 16,
    subjects: ['音乐'],
    building: '初中艺术楼'
  },
  { key: 'j-art', stage: 'junior', count: 4, max: 16, subjects: ['美术'], building: '初中艺术楼' },
  {
    key: 'j-it',
    stage: 'junior',
    count: 4,
    max: 16,
    subjects: ['信息技术'],
    building: '初中实验楼'
  },
  {
    key: 'j-practice',
    stage: 'junior',
    count: 7,
    max: 16,
    subjects: ['劳动', '综合实践'],
    building: '初中实践楼'
  },

  {
    key: 's-chinese',
    stage: 'senior',
    count: 28,
    max: 12,
    subjects: ['语文'],
    building: '高中教学楼'
  },
  {
    key: 's-math',
    stage: 'senior',
    count: 28,
    max: 12,
    subjects: ['数学'],
    building: '高中教学楼'
  },
  {
    key: 's-english',
    stage: 'senior',
    count: 28,
    max: 12,
    subjects: ['英语'],
    building: '高中教学楼'
  },
  {
    key: 's-physics',
    stage: 'senior',
    count: 14,
    max: 12,
    subjects: ['物理', '高中物理实验'],
    building: '高中实验楼'
  },
  {
    key: 's-chemistry',
    stage: 'senior',
    count: 14,
    max: 12,
    subjects: ['化学', '高中化学实验'],
    building: '高中实验楼'
  },
  {
    key: 's-biology',
    stage: 'senior',
    count: 14,
    max: 12,
    subjects: ['生物', '高中生物实验'],
    building: '高中实验楼'
  },
  {
    key: 's-politics',
    stage: 'senior',
    count: 14,
    max: 12,
    subjects: ['政治'],
    building: '高中教学楼'
  },
  {
    key: 's-history',
    stage: 'senior',
    count: 14,
    max: 12,
    subjects: ['历史'],
    building: '高中教学楼'
  },
  {
    key: 's-geography',
    stage: 'senior',
    count: 14,
    max: 12,
    subjects: ['地理'],
    building: '高中教学楼'
  },
  // 40 个班 × 3 节无法在 9 人、每人上限 14 的“整班任务不可拆”条件下装箱；
  // 保持已确认的 9 人规模，个别教师允许 15 节，整体平均仍为 13.33 节。
  { key: 's-pe', stage: 'senior', count: 9, max: 15, subjects: ['体育'], building: '高中运动区' },
  {
    key: 's-tech',
    stage: 'senior',
    count: 6,
    max: 14,
    subjects: ['信息技术', '通用技术'],
    building: '高中科技楼'
  },
  {
    key: 's-art',
    stage: 'senior',
    count: 3,
    max: 14,
    subjects: ['音乐', '美术'],
    building: '高中艺术楼'
  },
  {
    key: 's-practice',
    stage: 'senior',
    count: 3,
    max: 14,
    subjects: ['劳动', '综合实践', '机器人项目', '创客项目'],
    building: '高中科技楼'
  }
]

interface RoomRecord {
  id: number
  name: string
  type: string
  capacity: number
  concurrent: number
  building: string
}

interface ClassRecord {
  id: number
  gradeId: number
  gradeName: string
  stage: StageCode
  index: number
  name: string
  homeRoomId: number
  headTeacherId: number | null
}

interface TeacherRecord {
  id: number
  poolKey: string
  stage: StageCode
  max: number
  load: number
  subjects: string[]
  isHead: boolean
}

interface TaskDraft {
  id?: number
  classId: number
  gradeName: string
  stage: StageCode
  classIndex: number
  subject: string
  periods: number
  weekMode: WeekMode
  consecutiveCount: number
  consecutiveSize: number
  fixedRoomId: number | null
  poolKey: string
  teacherId?: number
}

function teacherName(index: number): string {
  return (
    SURNAMES[index % SURNAMES.length] +
    GIVEN_NAMES[Math.floor(index / SURNAMES.length) % GIVEN_NAMES.length]
  )
}

function poolFor(stage: StageCode, subject: string): PoolSpec {
  const hit = POOL_SPECS.find((p) => p.stage === stage && p.subjects.includes(subject))
  if (!hit) throw new Error(`全功能预设缺少教师池：${stage}/${subject}`)
  return hit
}

export function loadFullSchoolPreset(): PresetLoadResult {
  const db = getDb()

  const seed = db.transaction(() => {
    // 加载预设本身就是破坏性操作：清掉全部业务数据，保留内置三学段、学科和权重字典。
    db.prepare('DELETE FROM adjust_log').run()
    db.prepare('DELETE FROM lesson').run()
    db.prepare('DELETE FROM schedule_version').run()
    db.prepare('DELETE FROM fixed_lesson').run()
    db.prepare('DELETE FROM time_rule').run()
    db.prepare('DELETE FROM subject_classroom').run()
    db.prepare('DELETE FROM room_coexist_rule').run()
    db.prepare('DELETE FROM group_member').run()
    db.prepare('DELETE FROM constraint_group').run()
    db.prepare('DELETE FROM teaching_task').run()
    db.prepare('DELETE FROM klass').run()
    db.prepare('DELETE FROM grade').run()
    db.prepare('DELETE FROM classroom').run()
    db.prepare('DELETE FROM teacher_subject').run()
    db.prepare('DELETE FROM teacher').run()
    db.prepare('DELETE FROM semester').run()
    // 内置 19 学科的 stage_id 均为 NULL；加载预设时清除用户/旧预设遗留的学段专属学科，
    // 保证每次载入都得到同一份 28 学科黄金快照。
    db.prepare('DELETE FROM subject WHERE stage_id IS NOT NULL').run()
    for (const s of CUSTOM_SUBJECTS) db.prepare('DELETE FROM subject WHERE name = ?').run(s.name)

    db.prepare(
      `INSERT INTO school(id, name, school_type) VALUES (1, ?, 'twelve_year')
       ON CONFLICT(id) DO UPDATE SET name=excluded.name, school_type=excluded.school_type`
    ).run(SCHOOL_NAME)
    const semesterId = Number(
      db
        .prepare(
          `INSERT INTO semester(name, start_date, end_date, is_current)
         VALUES (?, '2026-09-01', '2027-01-20', 1)`
        )
        .run(SEMESTER_NAME).lastInsertRowid
    )

    const stageRows = db.prepare('SELECT id, code FROM stage').all() as {
      id: number
      code: string
    }[]
    const stageId = new Map(stageRows.map((s) => [s.code as StageCode, s.id]))
    for (const code of ['primary', 'junior', 'senior'] as StageCode[]) {
      if (!stageId.has(code)) throw new Error(`缺少内置学段 ${code}`)
      db.prepare('UPDATE stage SET enabled=1, days_per_week=5, has_evening=? WHERE id=?').run(
        code === 'senior' ? 1 : 0,
        stageId.get(code)!
      )
      db.prepare('DELETE FROM time_slot WHERE stage_id=?').run(stageId.get(code)!)
    }

    const stagePeriods: Record<
      StageCode,
      { name: string; segment: string; start: string; end: string }[]
    > = {
      primary: [
        ['第1节', 'morning', '08:00', '08:40'],
        ['第2节', 'morning', '08:50', '09:30'],
        ['第3节', 'morning', '09:50', '10:30'],
        ['第4节', 'morning', '10:40', '11:20'],
        ['第5节', 'afternoon', '14:00', '14:40'],
        ['第6节', 'afternoon', '14:50', '15:30'],
        ['第7节', 'afternoon', '15:40', '16:20']
      ].map(([name, segment, start, end]) => ({ name, segment, start, end })),
      junior: [
        ['第1节', 'morning', '08:00', '08:45'],
        ['第2节', 'morning', '08:55', '09:40'],
        ['第3节', 'morning', '10:00', '10:45'],
        ['第4节', 'morning', '10:55', '11:40'],
        ['第5节', 'morning', '11:50', '12:35'],
        ['第6节', 'afternoon', '14:00', '14:45'],
        ['第7节', 'afternoon', '14:55', '15:40'],
        ['第8节', 'afternoon', '15:50', '16:35']
      ].map(([name, segment, start, end]) => ({ name, segment, start, end })),
      senior: [
        ['早读', 'morning', '07:30', '07:55'],
        ['第1节', 'morning', '08:00', '08:45'],
        ['第2节', 'morning', '08:55', '09:40'],
        ['第3节', 'morning', '10:00', '10:45'],
        ['第4节', 'morning', '10:55', '11:40'],
        ['第5节', 'morning', '11:50', '12:35'],
        ['第6节', 'afternoon', '14:00', '14:45'],
        ['第7节', 'afternoon', '14:55', '15:40'],
        ['第8节', 'afternoon', '15:50', '16:35'],
        ['第9节', 'afternoon', '16:45', '17:30'],
        ['晚自习1', 'evening', '19:00', '19:45'],
        ['晚自习2', 'evening', '19:55', '20:40'],
        ['晚自习3', 'evening', '20:50', '21:35']
      ].map(([name, segment, start, end]) => ({ name, segment, start, end }))
    }

    const insertSlot = db.prepare(
      `INSERT INTO time_slot(stage_id, day_of_week, period_index, period_name, segment,
                             start_time, end_time, is_teaching, sort_order)
       VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)`
    )
    const slots = new Map<string, number>()
    for (const code of ['primary', 'junior', 'senior'] as StageCode[]) {
      for (let day = 1; day <= 5; day++) {
        stagePeriods[code].forEach((p, index) => {
          const period = index + 1
          const id = Number(
            insertSlot.run(
              stageId.get(code)!,
              day,
              period,
              p.name,
              p.segment,
              p.start,
              p.end,
              (day - 1) * stagePeriods[code].length + period
            ).lastInsertRowid
          )
          slots.set(`${code}:${day}:${period}`, id)
        })
      }
    }
    const slotAt = (stage: StageCode, day: number, period: number): number => {
      const id = slots.get(`${stage}:${day}:${period}`)
      if (id == null) throw new Error(`找不到时段 ${stage}/${day}/${period}`)
      return id
    }

    // 自定义实验与项目学科。
    const insertSubject = db.prepare(
      `INSERT INTO subject(name, short_name, color, category, importance, need_special_room,
                           stage_id, daily_max, week_spread, sort_order)
       VALUES (?, ?, ?, 'minor', ?, 1, ?, 1, 'spread', ?)`
    )
    CUSTOM_SUBJECTS.forEach((s, index) =>
      insertSubject.run(
        s.name,
        s.shortName,
        s.color,
        s.importance,
        stageId.get(s.stage)!,
        100 + index
      )
    )
    const subjectRows = db.prepare('SELECT id, name FROM subject').all() as {
      id: number
      name: string
    }[]
    const subjectId = new Map(subjectRows.map((s) => [s.name, s.id]))
    const subject = (name: string): number => {
      const id = subjectId.get(name)
      if (id == null) throw new Error(`缺少学科「${name}」`)
      return id
    }

    // 教室与场地，共 347 间/处。
    const rooms: RoomRecord[] = []
    const insertRoom = db.prepare(
      `INSERT INTO classroom(name, room_type, capacity, concurrent_capacity, building, enabled)
       VALUES (?, ?, ?, ?, ?, 1)`
    )
    const addRoom = (
      name: string,
      type: string,
      capacity: number,
      concurrent: number,
      building: string
    ): number => {
      const id = Number(insertRoom.run(name, type, capacity, concurrent, building).lastInsertRowid)
      rooms.push({ id, name, type, capacity, concurrent, building })
      return id
    }
    const addRooms = (
      prefix: string,
      count: number,
      type: string,
      capacity: number,
      building: string
    ): number[] =>
      Array.from({ length: count }, (_, i) =>
        addRoom(`${prefix}${i + 1}`, type, capacity, 1, building)
      )

    const roomPools: Record<StageCode, Record<string, number[]>> = {
      primary: {},
      junior: {},
      senior: {}
    }
    roomPools.primary.science = addRooms('小学科学实验室', 4, 'lab', 60, '小学科学楼')
    roomPools.primary.computer = addRooms('小学计算机教室', 4, 'computer', 60, '小学科学楼')
    roomPools.primary.music = addRooms('小学音乐教室', 8, 'music', 60, '小学艺术楼')
    roomPools.primary.art = addRooms('小学美术教室', 8, 'art', 60, '小学艺术楼')
    roomPools.primary.practice = addRooms('小学劳动创客教室', 8, 'other', 60, '小学实践楼')
    roomPools.primary.sports = [
      addRoom('小学田径场', 'sports', 648, 8, '小学运动区'),
      addRoom('小学体育馆', 'sports', 216, 4, '小学运动区'),
      addRoom('小学篮球活动区', 'sports', 324, 6, '小学运动区'),
      addRoom('小学游泳馆', 'sports', 108, 2, '小学运动区')
    ]

    roomPools.junior.physics = addRooms('初中物理实验室', 3, 'lab', 60, '初中实验楼')
    roomPools.junior.chemistry = addRooms('初中化学实验室', 2, 'lab', 60, '初中实验楼')
    roomPools.junior.biology = addRooms('初中生物实验室', 3, 'lab', 60, '初中实验楼')
    roomPools.junior.computer = addRooms('初中计算机教室', 3, 'computer', 60, '初中实验楼')
    roomPools.junior.music = addRooms('初中音乐教室', 2, 'music', 60, '初中艺术楼')
    roomPools.junior.art = addRooms('初中美术教室', 2, 'art', 60, '初中艺术楼')
    roomPools.junior.practice = addRooms('初中劳动创客教室', 3, 'other', 60, '初中实践楼')
    roomPools.junior.sports = [
      addRoom('初中田径场', 'sports', 432, 6, '初中运动区'),
      addRoom('初中体育馆', 'sports', 216, 4, '初中运动区'),
      addRoom('初中球类场地', 'sports', 216, 4, '初中运动区')
    ]

    roomPools.senior.physics = addRooms('高中物理实验室', 3, 'lab', 60, '高中实验楼')
    roomPools.senior.chemistry = addRooms('高中化学实验室', 3, 'lab', 60, '高中实验楼')
    roomPools.senior.biology = addRooms('高中生物实验室', 3, 'lab', 60, '高中实验楼')
    roomPools.senior.computer = addRooms('高中计算机教室', 3, 'computer', 60, '高中科技楼')
    roomPools.senior.tech = addRooms('高中通用技术教室', 2, 'other', 60, '高中科技楼')
    roomPools.senior.music = addRooms('高中音乐教室', 2, 'music', 60, '高中艺术楼')
    roomPools.senior.art = addRooms('高中美术教室', 2, 'art', 60, '高中艺术楼')
    roomPools.senior.practice = addRooms('高中劳动项目室', 2, 'other', 60, '高中科技楼')
    roomPools.senior.sports = [
      addRoom('高中田径场', 'sports', 432, 6, '高中运动区'),
      addRoom('高中体育馆', 'sports', 216, 4, '高中运动区'),
      addRoom('高中球类场地', 'sports', 216, 4, '高中运动区')
    ]

    const shared = {
      auditorium: [addRoom('学校大礼堂', 'other', 1200, 1, '公共教学中心')],
      lecture: addRooms('阶梯报告厅', 4, 'other', 240, '公共教学中心'),
      library: Array.from({ length: 3 }, (_, i) =>
        addRoom(`图书阅览空间${i + 1}`, 'other', 216, 3, '图书馆')
      ),
      psychology: addRooms('心理活动室', 2, 'other', 60, '公共教学中心'),
      dance: addRooms('舞蹈教室', 2, 'other', 60, '艺术中心'),
      recording: [addRoom('录播教室', 'other', 60, 1, '公共教学中心')],
      robotics: addRooms('机器人与人工智能实验室', 2, 'other', 60, '科技中心')
    }

    // 年级、班级与 240 间固定教室。
    const insertGrade = db.prepare(
      `INSERT INTO grade(semester_id, stage_id, name, enroll_year, sort_order)
       VALUES (?, ?, ?, ?, ?)`
    )
    const insertClass = db.prepare(
      `INSERT INTO klass(grade_id, name, short_name, student_count, home_room_id, sort_order)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    const classes: ClassRecord[] = []
    const gradeIds = new Map<string, number>()
    GRADE_SPECS.forEach((g, gradeIndex) => {
      const enrollYear =
        g.stage === 'primary'
          ? 2026 - gradeIndex
          : g.stage === 'junior'
            ? 2020 - (gradeIndex - 6)
            : 2017 - (gradeIndex - 9)
      const gid = Number(
        insertGrade.run(semesterId, stageId.get(g.stage)!, g.name, enrollYear, gradeIndex + 1)
          .lastInsertRowid
      )
      gradeIds.set(g.name, gid)
      for (let i = 1; i <= CLASSES_PER_GRADE; i++) {
        const className = `${g.name}(${i})班`
        const homeRoomId = addRoom(`${className}固定教室`, 'normal', 60, 1, g.building)
        const cid = Number(
          insertClass.run(gid, className, `${i}班`, STUDENTS_PER_CLASS, homeRoomId, i)
            .lastInsertRowid
        )
        classes.push({
          id: cid,
          gradeId: gid,
          gradeName: g.name,
          stage: g.stage,
          index: i,
          name: className,
          homeRoomId,
          headTeacherId: null
        })
      }
    })
    for (let i = 1; i <= 12; i++)
      addRoom(
        `机动普通教室${i}`,
        'normal',
        60,
        1,
        i <= 3
          ? '小学低年级教学楼'
          : i <= 6
            ? '小学高年级教学楼'
            : i <= 9
              ? '初中教学楼'
              : '高中教学楼'
      )

    if (rooms.length !== 347) throw new Error(`场地数量应为 347，实际 ${rooms.length}`)

    // 学科到专用场地。通用学科虽绑定全校场地，但每条任务再固定到本学段场地，避免跨学段共用。
    const bindRoom = db.prepare(
      `INSERT INTO subject_classroom(subject_id, classroom_id, slots_taken, priority)
       VALUES (?, ?, 1, ?)`
    )
    const bind = (subjectName: string, ids: number[], priority = 0): void => {
      ids.forEach((id, i) => bindRoom.run(subject(subjectName), id, priority + i))
    }
    bind('信息技术', [
      ...roomPools.primary.computer,
      ...roomPools.junior.computer,
      ...roomPools.senior.computer
    ])
    bind('通用技术', roomPools.senior.tech)
    bind('音乐', [...roomPools.primary.music, ...roomPools.junior.music, ...roomPools.senior.music])
    bind('美术', [...roomPools.primary.art, ...roomPools.junior.art, ...roomPools.senior.art])
    bind('体育', [
      ...roomPools.primary.sports,
      ...roomPools.junior.sports,
      ...roomPools.senior.sports
    ])
    bind('小学科学实验', roomPools.primary.science)
    bind('初中物理实验', roomPools.junior.physics)
    bind('初中化学实验', roomPools.junior.chemistry)
    bind('初中生物实验', roomPools.junior.biology)
    bind('高中物理实验', roomPools.senior.physics)
    bind('高中化学实验', roomPools.senior.chemistry)
    bind('高中生物实验', roomPools.senior.biology)
    bind('机器人项目', shared.robotics)
    bind('创客项目', shared.robotics)

    // 547 名教师，按学段和学科工作量分池。
    const insertTeacher = db.prepare(
      `INSERT INTO teacher(name, staff_no, max_weekly_periods, building, enabled)
       VALUES (?, ?, ?, ?, 1)`
    )
    const insertTeacherSubject = db.prepare(
      'INSERT INTO teacher_subject(teacher_id, subject_id) VALUES (?, ?)'
    )
    const teachers: TeacherRecord[] = []
    let globalTeacherIndex = 0
    const stageSequence: Record<StageCode, number> = { primary: 0, junior: 0, senior: 0 }
    for (const pool of POOL_SPECS) {
      for (let i = 0; i < pool.count; i++) {
        const prefix = pool.stage === 'primary' ? 'P' : pool.stage === 'junior' ? 'J' : 'S'
        stageSequence[pool.stage] += 1
        const tid = Number(
          insertTeacher.run(
            teacherName(globalTeacherIndex++),
            `${prefix}${String(stageSequence[pool.stage]).padStart(4, '0')}`,
            pool.max,
            pool.building
          ).lastInsertRowid
        )
        for (const s of pool.subjects) insertTeacherSubject.run(tid, subject(s))
        teachers.push({
          id: tid,
          poolKey: pool.key,
          stage: pool.stage,
          max: pool.max,
          load: 0,
          subjects: pool.subjects,
          isHead: false
        })
      }
    }
    if (teachers.length !== 547) throw new Error(`教师数量应为 547，实际 ${teachers.length}`)

    const fixedRoomFor = (c: ClassRecord, subjectName: string): number | null => {
      const index = c.gradeId * 31 + c.index - 1
      const pool = roomPools[c.stage]
      if (subjectName === '体育') {
        if ((c.gradeName === '初二' || c.gradeName === '高一') && c.index >= 15 && c.index <= 20)
          return pool.sports[0]
        // 按 concurrent_capacity 加权分配；若按“场地个数”平均分，游泳馆这类
        // 并发仅 2 的场地会与田径场（并发 8）承担同样多班级，必然成为瓶颈。
        const weighted = pool.sports.flatMap((roomId) => {
          const concurrent = rooms.find((room) => room.id === roomId)?.concurrent ?? 1
          return Array.from({ length: concurrent }, () => roomId)
        })
        return weighted[index % weighted.length]
      }
      if (subjectName === '信息技术') return pool.computer[index % pool.computer.length]
      if (subjectName === '通用技术') {
        // 高一 19/20 班留给拼合组动态挑两间技术室。
        if (c.gradeName === '高一' && c.index >= 19) return null
        return pool.tech[index % pool.tech.length]
      }
      if (subjectName === '音乐') return pool.music[index % pool.music.length]
      if (subjectName === '美术') return pool.art[index % pool.art.length]
      // 劳动/综合实践并非每节都必须进入功能室；每年级选 8 个班绑定实践室，
      // 其余在固定教室开展。这样既覆盖任务级固定场地，又不给紧学段制造人为瓶颈。
      if ((subjectName === '劳动' || subjectName === '综合实践') && c.index <= 8) {
        return pool.practice[index % pool.practice.length]
      }
      return null
    }

    const taskDrafts: TaskDraft[] = []
    for (const c of classes) {
      const spec = GRADE_SPECS.find((g) => g.name === c.gradeName)!
      for (const baseEntry of spec.entries) {
        let subjectName = baseEntry.subject
        if (c.gradeName === '高一' && c.index === 1 && subjectName === '综合实践')
          subjectName = '机器人项目'
        if (c.gradeName === '高一' && c.index === 2 && subjectName === '综合实践')
          subjectName = '创客项目'

        const consecutive =
          (c.stage === 'primary' &&
            ['三年级', '四年级', '五年级', '六年级'].includes(c.gradeName) &&
            subjectName === '美术' &&
            c.index % 5 === 0) ||
          (c.gradeName === '初三' && subjectName === '物理' && c.index <= 10) ||
          (c.gradeName === '高二' && subjectName === '物理' && c.index <= 10)

        const make = (weekMode: WeekMode): TaskDraft => ({
          classId: c.id,
          gradeName: c.gradeName,
          stage: c.stage,
          classIndex: c.index,
          subject: subjectName,
          periods: baseEntry.periods,
          weekMode,
          consecutiveCount: consecutive ? 1 : 0,
          consecutiveSize: consecutive ? 2 : 1,
          fixedRoomId: fixedRoomFor(c, subjectName),
          poolKey: poolFor(c.stage, subjectName).key
        })

        // 四个高一班把通用技术拆成单双周两条，实际每周仍上一节。
        if (c.gradeName === '高一' && c.index <= 4 && subjectName === '通用技术') {
          taskDrafts.push(make('odd'), make('even'))
        } else {
          taskDrafts.push(make('all'))
        }
      }
    }

    // 同班同教师池的任务作为一个不可拆分的任教包分配：理论/实验由同一教师承担，
    // 高中音美、信息/通用技术等复合教师池也由同一教师负责该班。
    const grouped = new Map<string, TaskDraft[]>()
    for (const t of taskDrafts) {
      const key = `${t.classId}:${t.poolKey}`
      const list = grouped.get(key) ?? []
      list.push(t)
      grouped.set(key, list)
    }
    const teachersByPool = new Map<string, TeacherRecord[]>()
    for (const t of teachers) {
      const list = teachersByPool.get(t.poolKey) ?? []
      list.push(t)
      teachersByPool.set(t.poolKey, list)
    }
    const groupsByPool = new Map<string, TaskDraft[][]>()
    for (const list of grouped.values()) {
      const key = list[0].poolKey
      const rows = groupsByPool.get(key) ?? []
      rows.push(list)
      groupsByPool.set(key, rows)
    }
    for (const [poolKey, groups] of groupsByPool) {
      const pool = teachersByPool.get(poolKey) ?? []
      groups.sort(
        (a, b) => b.reduce((s, t) => s + t.periods, 0) - a.reduce((s, t) => s + t.periods, 0)
      )

      // 两种确定性装箱策略互为兜底：
      //  - best-fit 适合小学数学的 4/5 节整班组合；
      //  - balanced 适合小学体育 4/3 节、初中物理 3/2 节这类必须混装的组合。
      // 只按总课时除人数会忽略“整班任务不可拆”，因此必须先得到真实可装箱方案再落库。
      const plan = (
        strategy: 'best-fit' | 'balanced'
      ): { teacher: TeacherRecord; group: TaskDraft[]; load: number }[] | null => {
        const localLoads = new Map(pool.map((t) => [t.id, 0]))
        const assignments: { teacher: TeacherRecord; group: TaskDraft[]; load: number }[] = []
        for (const group of groups) {
          const load = group.reduce((sum, t) => sum + t.periods, 0)
          const picked = [...pool]
            .filter((t) => (localLoads.get(t.id) ?? 0) + load <= t.max)
            .sort((a, b) => {
              const la = localLoads.get(a.id) ?? 0
              const lb = localLoads.get(b.id) ?? 0
              return strategy === 'best-fit' ? lb - la || a.id - b.id : la - lb || a.id - b.id
            })[0]
          if (!picked) return null
          localLoads.set(picked.id, (localLoads.get(picked.id) ?? 0) + load)
          assignments.push({ teacher: picked, group, load })
        }
        return assignments
      }
      const assignments = plan('best-fit') ?? plan('balanced')
      if (!assignments)
        throw new Error(`教师池 ${poolKey} 的整班任务在既定人数与工作量上限下无法装箱`)
      for (const assignment of assignments) {
        assignment.teacher.load += assignment.load
        assignment.group.forEach((t) => {
          t.teacherId = assignment.teacher.id
        })
      }
    }

    const insertTask = db.prepare(
      `INSERT INTO teaching_task(semester_id, class_id, subject_id, teacher_id, weekly_periods,
                                 consecutive_count, consecutive_size, week_mode, fixed_room_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    for (const t of taskDrafts) {
      t.id = Number(
        insertTask.run(
          semesterId,
          t.classId,
          subject(t.subject),
          t.teacherId!,
          t.periods,
          t.consecutiveCount,
          t.consecutiveSize,
          t.weekMode,
          t.fixedRoomId
        ).lastInsertRowid
      )
    }
    if (taskDrafts.length !== 3124)
      throw new Error(`教学任务数应为 3124，实际 ${taskDrafts.length}`)

    // 班主任采用二分图增广匹配：必须任教本班，且一人只带一个班。
    const headPriority: Record<StageCode, string[]> = {
      primary: ['语文', '数学', '英语', '道德与法治', '科学'],
      junior: ['语文', '数学', '英语', '物理', '化学', '道德与法治', '历史'],
      senior: ['语文', '数学', '英语', '物理', '化学', '生物', '政治', '历史', '地理']
    }
    const candidates = new Map<number, number[]>()
    for (const c of classes) {
      const own = taskDrafts.filter((t) => t.classId === c.id)
      const ids: number[] = []
      for (const s of headPriority[c.stage]) {
        for (const t of own.filter((x) => x.subject === s)) {
          if (t.teacherId != null && !ids.includes(t.teacherId)) ids.push(t.teacherId)
        }
      }
      for (const t of own)
        if (t.teacherId != null && !ids.includes(t.teacherId)) ids.push(t.teacherId)
      candidates.set(c.id, ids)
    }
    const classOfTeacher = new Map<number, number>()
    const match = (classId: number, seen: Set<number>): boolean => {
      for (const teacherId of candidates.get(classId) ?? []) {
        if (seen.has(teacherId)) continue
        seen.add(teacherId)
        const previous = classOfTeacher.get(teacherId)
        if (previous == null || match(previous, seen)) {
          classOfTeacher.set(teacherId, classId)
          return true
        }
      }
      return false
    }
    for (const c of classes) {
      if (!match(c.id, new Set())) throw new Error(`无法为 ${c.name} 匹配唯一班主任`)
    }
    const updateHead = db.prepare('UPDATE klass SET head_teacher_id=? WHERE id=?')
    for (const [teacherId, classId] of classOfTeacher) {
      updateHead.run(teacherId, classId)
      const c = classes.find((row) => row.id === classId)!
      c.headTeacherId = teacherId
      const t = teachers.find((row) => row.id === teacherId)
      if (t) t.isHead = true
    }

    // 预排：240 班会 + 12 升旗 + 高中 15 早读/45 晚自习 + 16 资源占用 = 328。
    const insertFixed = db.prepare(
      `INSERT INTO fixed_lesson(semester_id, class_id, grade_id, subject_id, teacher_id,
                               classroom_id, slot_id, label, kind)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    const classMeetingSlot: Record<StageCode, number> = {
      primary: slotAt('primary', 5, 6),
      junior: slotAt('junior', 5, 7),
      senior: slotAt('senior', 5, 9)
    }
    for (const c of classes) {
      insertFixed.run(
        semesterId,
        c.id,
        null,
        subject('班会'),
        c.headTeacherId,
        c.homeRoomId,
        classMeetingSlot[c.stage],
        '班会',
        'lesson'
      )
    }
    for (const g of GRADE_SPECS) {
      const period = g.stage === 'senior' ? 2 : 1
      insertFixed.run(
        semesterId,
        null,
        gradeIds.get(g.name)!,
        null,
        null,
        null,
        slotAt(g.stage, 1, period),
        '升旗与晨会',
        'lesson'
      )
    }
    for (const gradeName of ['高一', '高二', '高三']) {
      const gid = gradeIds.get(gradeName)!
      for (let day = 1; day <= 5; day++) {
        insertFixed.run(
          semesterId,
          null,
          gid,
          null,
          null,
          null,
          slotAt('senior', day, 1),
          '早读',
          'lesson'
        )
        for (const period of [11, 12, 13]) {
          insertFixed.run(
            semesterId,
            null,
            gid,
            null,
            null,
            null,
            slotAt('senior', day, period),
            `晚自习${period - 10}`,
            'lesson'
          )
        }
      }
    }
    const maintenanceRooms = [
      ...roomPools.primary.science.slice(0, 3),
      ...roomPools.junior.physics.slice(0, 3),
      ...roomPools.senior.chemistry.slice(0, 3),
      shared.recording[0]
    ]
    maintenanceRooms.forEach((roomId, i) => {
      const code: StageCode = i < 3 ? 'primary' : i < 6 ? 'junior' : 'senior'
      const last = code === 'primary' ? 7 : code === 'junior' ? 8 : 10
      insertFixed.run(
        semesterId,
        null,
        null,
        null,
        null,
        roomId,
        slotAt(code, 3, last),
        '设备维护/场地外借',
        'block'
      )
    })
    const meetingTeachers = teachers.filter((t) => !t.isHead && t.load < t.max).slice(0, 6)
    if (meetingTeachers.length !== 6) throw new Error('找不到 6 名可用于行政教研占位的教师')
    meetingTeachers.forEach((t) => {
      const last = t.stage === 'primary' ? 7 : t.stage === 'junior' ? 8 : 10
      insertFixed.run(
        semesterId,
        null,
        null,
        null,
        t.id,
        null,
        slotAt(t.stage, 4, last),
        '教研/行政会议',
        'block'
      )
    })

    // 四层时段规则：global / grade / class / teacher / subject 全覆盖。
    const insertRule = db.prepare(
      `INSERT INTO time_rule(semester_id, scope_type, scope_id, slot_id, rule_value)
       VALUES (?, ?, ?, ?, ?)`
    )
    for (const code of ['primary', 'junior', 'senior'] as StageCode[]) {
      const last = code === 'primary' ? 7 : code === 'junior' ? 8 : 10
      insertRule.run(semesterId, 'global', null, slotAt(code, 5, last), 'AVOID')
    }
    for (const gradeName of ['一年级', '二年级']) {
      for (let day = 1; day <= 5; day++) {
        insertRule.run(
          semesterId,
          'grade',
          gradeIds.get(gradeName)!,
          slotAt('primary', day, 7),
          'FORBIDDEN'
        )
      }
    }
    for (const code of ['primary', 'junior', 'senior'] as StageCode[]) {
      const first = code === 'senior' ? 2 : 1
      for (const subjectName of ['语文', '数学', '英语']) {
        for (let day = 1; day <= 5; day++) {
          insertRule.run(
            semesterId,
            'subject',
            subject(subjectName),
            slotAt(code, day, first),
            'PREFERRED'
          )
          insertRule.run(
            semesterId,
            'subject',
            subject(subjectName),
            slotAt(code, day, first + 1),
            'PREFERRED'
          )
        }
      }
      for (let day = 1; day <= 5; day++) {
        insertRule.run(
          semesterId,
          'subject',
          subject('体育'),
          slotAt(code, day, first),
          'FORBIDDEN'
        )
      }
    }
    const labSubjects: { stage: StageCode; subjects: string[]; periods: number[] }[] = [
      { stage: 'primary', subjects: ['小学科学实验'], periods: [3, 4] },
      {
        stage: 'junior',
        subjects: ['初中物理实验', '初中化学实验', '初中生物实验'],
        periods: [3, 4]
      },
      {
        stage: 'senior',
        subjects: ['高中物理实验', '高中化学实验', '高中生物实验'],
        periods: [4, 5]
      }
    ]
    for (const row of labSubjects) {
      for (const subjectName of row.subjects) {
        for (let day = 1; day <= 5; day++) {
          for (const period of row.periods) {
            insertRule.run(
              semesterId,
              'subject',
              subject(subjectName),
              slotAt(row.stage, day, period),
              'PREFERRED'
            )
          }
        }
      }
    }
    for (const c of classes.filter((_, i) => i % 10 === 0)) {
      const last = c.stage === 'primary' ? 7 : c.stage === 'junior' ? 8 : 10
      insertRule.run(semesterId, 'class', c.id, slotAt(c.stage, 3, last), 'AVOID')
    }
    const teacherRuleTargets = [
      ...teachers.filter((t) => t.stage === 'primary').slice(0, 8),
      ...teachers.filter((t) => t.stage === 'junior').slice(0, 8),
      ...teachers.filter((t) => t.stage === 'senior').slice(0, 8)
    ]
    for (const t of teacherRuleTargets) {
      const periods =
        t.stage === 'primary' ? [5, 6, 7] : t.stage === 'junior' ? [6, 7, 8] : [7, 8, 9, 10]
      for (const period of periods) {
        insertRule.run(semesterId, 'teacher', t.id, slotAt(t.stage, 3, period), 'FORBIDDEN')
      }
    }
    for (let day = 1; day <= 5; day++) {
      insertRule.run(semesterId, 'grade', gradeIds.get('高三')!, slotAt('senior', day, 10), 'AVOID')
    }

    const task = (
      gradeName: string,
      classIndex: number,
      subjectName: string,
      mode: WeekMode = 'all'
    ): TaskDraft => {
      const hit = taskDrafts.find(
        (t) =>
          t.gradeName === gradeName &&
          t.classIndex === classIndex &&
          t.subject === subjectName &&
          t.weekMode === mode
      )
      if (!hit?.id)
        throw new Error(`找不到约束组任务 ${gradeName}/${classIndex}/${subjectName}/${mode}`)
      return hit
    }
    const insertGroup = db.prepare(
      `INSERT INTO constraint_group(semester_id, group_type, name, hardness, max_concurrent, scope_note)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    const insertMember = db.prepare(
      'INSERT INTO group_member(group_id, member_type, member_id) VALUES (?, ?, ?)'
    )
    const addGroup = (
      type: string,
      name: string,
      hardness: 'hard' | 'soft',
      members: { type: string; id: number }[],
      maxConcurrent: number | null = null,
      scopeNote: string | null = null
    ): number => {
      const id = Number(
        insertGroup.run(semesterId, type, name, hardness, maxConcurrent, scopeNote).lastInsertRowid
      )
      members.forEach((m) => insertMember.run(id, m.type, m.id))
      return id
    }

    // 每个学段各取两名低课时、非班主任教师做互斥样本；不能随手取满负荷教师，
    // 否则两人合计课时几乎占满全周，互斥组本身会把黄金数据变成极紧甚至无解。
    for (const [i, stage] of (['primary', 'junior', 'senior'] as StageCode[]).entries()) {
      const pair = teachers
        .filter((t) => t.stage === stage && !t.isHead)
        .sort((a, b) => a.load - b.load || a.id - b.id)
        .slice(0, 2)
      if (pair.length !== 2) throw new Error(`${stage} 学段找不到教师互斥组样本`)
      addGroup(
        'teacher_mutex',
        `共享备课资源互斥组${i + 1}`,
        'hard',
        pair.map((t) => ({ type: 'teacher', id: t.id })),
        1,
        'same_slot'
      )
    }
    const mergeGroups = [
      [task('四年级', 19, '小学科学实验'), task('四年级', 20, '小学科学实验')],
      [task('初一', 19, '初中生物实验'), task('初一', 20, '初中生物实验')],
      [task('高一', 19, '通用技术'), task('高一', 20, '通用技术')]
    ]
    mergeGroups.forEach((rows, i) => {
      const gid = addGroup(
        'merge',
        `拼合教学测试组${i + 1}`,
        'hard',
        rows.map((t) => ({ type: 'task', id: t.id! })),
        null,
        'same_slot'
      )
      rows.forEach((t) =>
        db.prepare('UPDATE teaching_task SET merge_group_id=? WHERE id=?').run(gid, t.id!)
      )
    })
    const simultaneousGroups = [
      [17, 18, 19, 20].map((i) => task('初二', i, '体育')),
      [15, 16, 17, 18].map((i) => task('高一', i, '体育'))
    ]
    simultaneousGroups.forEach((rows, i) =>
      addGroup(
        'simultaneous',
        `年级体育同槽组${i + 1}`,
        'hard',
        rows.map((t) => ({ type: 'task', id: t.id! })),
        null,
        'same_slot'
      )
    )
    addGroup(
      'subject_mutex',
      '机器人与创客共享设备',
      'hard',
      [
        { type: 'subject', id: subject('机器人项目') },
        { type: 'subject', id: subject('创客项目') }
      ],
      1,
      'same_slot'
    )
    addGroup(
      'subject_mutex',
      '音美场馆软互斥示例',
      'soft',
      [
        { type: 'subject', id: subject('音乐') },
        { type: 'subject', id: subject('美术') }
      ],
      3,
      'same_slot'
    )
    addGroup(
      'follow',
      '高一项目课程跟随示例',
      'soft',
      [
        { type: 'task', id: task('高一', 1, '机器人项目').id! },
        { type: 'task', id: task('高一', 1, '劳动').id! }
      ],
      null,
      'same_day'
    )
    addGroup(
      'follow',
      '初三理化课程跟随示例',
      'soft',
      [
        { type: 'task', id: task('初三', 1, '物理').id! },
        { type: 'task', id: task('初三', 1, '化学').id! }
      ],
      null,
      'same_day'
    )

    // 场地共存规则作为完整数据输入；当前引擎尚未消费，后续专项评测会单独补齐。
    const coexist = db.prepare(
      'INSERT INTO room_coexist_rule(classroom_id, subject_a, subject_b, allowed) VALUES (?, ?, ?, ?)'
    )
    coexist.run(roomPools.primary.sports[0], subject('体育'), subject('体育'), 1)
    coexist.run(roomPools.junior.sports[0], subject('体育'), subject('体育'), 1)
    coexist.run(roomPools.senior.sports[0], subject('体育'), subject('体育'), 1)
    coexist.run(shared.robotics[0], subject('机器人项目'), subject('创客项目'), 0)

    return { semesterId }
  })

  const { semesterId } = seed()
  const report = checkSolverInput(semesterId)
  const errors = report.issues.filter((i) => i.level === 'error')
  if (!report.ok)
    throw new Error(`全功能预设输入自检失败：${errors.map((e) => e.message).join('；')}`)

  const isGolden = (result: ReturnType<typeof solve>): boolean =>
    result.status === 'solved' && result.unplaced.length === 0 && result.violations.length === 0
  const failureDetail = (result: ReturnType<typeof solve>): string => {
    const violationSummary = [...new Set(result.violations.map((v) => `${v.code}:${v.message}`))]
      .slice(0, 8)
      .join('；')
    const unplacedSummary = result.unplaced
      .slice(0, 8)
      .map((id) => {
        const unit = result.ctx.units[id]
        const names = unit?.classIds
          .map((classId) => result.ctx.input.classes.find((c) => c.id === classId)?.name ?? classId)
          .join('+')
        const subjectName = result.ctx.input.subjects.find((s) => s.id === unit?.subjectId)?.name
        return `${names}/${subjectName}(师${unit?.teacherIds.join('+')},候选${result.ctx.domains[id]?.length ?? 0},互斥${unit?.mutexGroupIds.join('+')})`
      })
      .join('、')
    return (
      `status=${result.status}，未排=${result.unplaced.length}，硬冲突=${result.violations.length}` +
      `；未排样例=${unplacedSummary || '无'}；违反样例=${violationSummary || '无'}`
    )
  }

  const profiles = ['balanced', 'teacher_first', 'student_first'] as const
  const versionIds: number[] = []
  let baseline: ReturnType<typeof solve> | null = null
  for (const [index, profile] of profiles.entries()) {
    const started = Date.now()
    const candidate = solve(buildSolverInput(semesterId, profile), {
      starts: index === 0 ? 8 : 4,
      timeBudgetMs: 30_000,
      seed: 20261001 + index * 7919,
      // 三个版本都启用构造期软偏好与质量精修；S16 会优先填充各班每日第一节，
      // 但仍由硬约束门禁兜底，不会为了消除首节空堂制造冲突。
      qualityOptimize: true
    })
    if (index === 0 && !isGolden(candidate)) {
      throw new Error(`全功能预设未得到黄金课表：${failureDetail(candidate)}`)
    }
    const usedFallback = !isGolden(candidate)
    const result = usedFallback ? baseline! : candidate
    if (baseline == null) baseline = result
    const lessons = toPlacedLessons(result.ctx, result.solution)
    const saved = saveSchedule({
      semesterId,
      weightProfileCode: profile,
      solveMs: Date.now() - started,
      hardViolations: 0,
      metrics: {
        source: 'full-12year-golden-dataset',
        classes: 240,
        teachers: 547,
        rooms: 347,
        periods: result.stats.periods,
        accidentalBlocks: result.stats.accidentalBlocks,
        usedFallback
      },
      lessons
    })
    versionIds.push(saved.versionId)
  }
  const dbAfter = getDb()
  dbAfter
    .prepare('UPDATE schedule_version SET parent_id=? WHERE id IN (?, ?)')
    .run(versionIds[0], versionIds[1], versionIds[2])
  dbAfter.prepare('UPDATE schedule_version SET is_published=0 WHERE semester_id=?').run(semesterId)
  dbAfter.prepare('UPDATE schedule_version SET is_published=1 WHERE id=?').run(versionIds[0])

  return {
    success: true,
    message: `已载入「${SCHOOL_NAME}」：240 班、547 位教师、347 间场地，并生成 3 个零硬冲突课表版本。`,
    semesterId,
    versionId: versionIds[0]
  }
}

export const FULL_SCHOOL_EXPECTED = {
  schoolName: SCHOOL_NAME,
  classes: 240,
  students: 12_960,
  teachers: 547,
  rooms: 347,
  subjects: 28,
  tasks: 3_124,
  fixedLessons: 328,
  equivalentPeriods: 7_220,
  rawTaskPeriods: 7_224,
  versions: 3
} as const
