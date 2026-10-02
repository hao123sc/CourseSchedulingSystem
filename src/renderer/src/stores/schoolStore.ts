import { create } from 'zustand'
import { api } from '@renderer/lib/api'
import type { School, SchoolInput, Semester } from '@shared/types/entities'

interface SchoolState {
  school: School | null
  semesters: Semester[]
  currentSemester: Semester | null
  loaded: boolean
  load: () => Promise<void>
  reloadSemesters: () => Promise<void>
  saveSchool: (input: SchoolInput) => Promise<void>
  setCurrentSemester: (id: number) => Promise<void>
}

export const useSchoolStore = create<SchoolState>((set, get) => ({
  school: null,
  semesters: [],
  currentSemester: null,
  loaded: false,

  load: async () => {
    const [school, semesters, currentSemester] = await Promise.all([
      api['school:get'](),
      api['semester:list'](),
      api['semester:getCurrent']()
    ])
    set({ school, semesters, currentSemester, loaded: true })
  },

  reloadSemesters: async () => {
    const [semesters, currentSemester] = await Promise.all([
      api['semester:list'](),
      api['semester:getCurrent']()
    ])
    set({ semesters, currentSemester })
  },

  saveSchool: async (input) => {
    const school = await api['school:save'](input)
    set({ school })
  },

  setCurrentSemester: async (id) => {
    await api['semester:setCurrent'](id)
    await get().reloadSemesters()
  }
}))
