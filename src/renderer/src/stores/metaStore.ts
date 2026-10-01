import { create } from 'zustand'
import { api } from '@renderer/lib/api'
import type {
  Classroom,
  Grade,
  Klass,
  Stage,
  Subject,
  Teacher,
  TimeSlot
} from '@shared/types/entities'

/**
 * 「教学任务」「排课规则」两页共用的基础数据缓存。
 * 这些数据在 M1 就录完了，M2 只读不写，因此集中缓存一份，避免每个 Tab 各拉一遍。
 */
interface MetaState {
  loadedSemesterId: number | null
  loading: boolean
  stages: Stage[]
  grades: Grade[]
  classes: Klass[]
  subjects: Subject[]
  teachers: Teacher[]
  classrooms: Classroom[]
  /** stageId → 该学段作息（含非教学占位，按天/节排序） */
  slotsByStage: Record<number, TimeSlot[]>
  load: (semesterId: number, force?: boolean) => Promise<void>
  reloadSubjects: () => Promise<void>
  reset: () => void
}

export const useMetaStore = create<MetaState>((set, get) => ({
  loadedSemesterId: null,
  loading: false,
  stages: [],
  grades: [],
  classes: [],
  subjects: [],
  teachers: [],
  classrooms: [],
  slotsByStage: {},

  load: async (semesterId, force = false) => {
    if (!force && get().loadedSemesterId === semesterId) return
    set({ loading: true })
    const [stages, grades, classes, subjects, teachers, classrooms] = await Promise.all([
      api['stage:list'](),
      api['grade:list'](semesterId),
      api['class:listBySemester'](semesterId),
      api['subject:list'](),
      api['teacher:list'](),
      api['classroom:list']()
    ])
    const slotLists = await Promise.all(
      stages.map((s) => api['timeSlot:listByStage'](s.id).then((rows) => [s.id, rows] as const))
    )
    set({
      loadedSemesterId: semesterId,
      loading: false,
      stages,
      grades,
      classes,
      subjects,
      teachers,
      classrooms,
      slotsByStage: Object.fromEntries(slotLists)
    })
  },

  reloadSubjects: async () => {
    set({ subjects: await api['subject:list']() })
  },

  reset: () =>
    set({
      loadedSemesterId: null,
      loading: false,
      stages: [],
      grades: [],
      classes: [],
      subjects: [],
      teachers: [],
      classrooms: [],
      slotsByStage: {}
    })
}))

/** 派生：班级 id → 所属年级 */
export function useClassGradeMap(): Map<number, Grade> {
  const { classes, grades } = useMetaStore()
  const gradeById = new Map(grades.map((g) => [g.id, g]))
  const map = new Map<number, Grade>()
  for (const c of classes) {
    const g = gradeById.get(c.gradeId)
    if (g) map.set(c.id, g)
  }
  return map
}
