import { getDb } from '../connection'
import type { School, SchoolInput } from '@shared/types/entities'
import type { SchoolType } from '@shared/domain'

interface SchoolRow {
  id: number
  name: string
  school_type: string
  logo_path: string | null
  created_at: string
}

function toEntity(r: SchoolRow): School {
  return {
    id: 1,
    name: r.name,
    schoolType: r.school_type as SchoolType,
    logoPath: r.logo_path,
    createdAt: r.created_at
  }
}

export const schoolRepo = {
  get(): School | null {
    const row = getDb().prepare('SELECT * FROM school WHERE id = 1').get() as SchoolRow | undefined
    return row ? toEntity(row) : null
  },

  /** 单机单校：id 恒为 1，存在则更新，不存在则插入（upsert） */
  save(input: SchoolInput): School {
    const db = getDb()
    db.prepare(
      `INSERT INTO school (id, name, school_type, logo_path)
       VALUES (1, @name, @schoolType, @logoPath)
       ON CONFLICT(id) DO UPDATE SET
         name = excluded.name,
         school_type = excluded.school_type,
         logo_path = excluded.logo_path`
    ).run({
      name: input.name,
      schoolType: input.schoolType,
      logoPath: input.logoPath ?? null
    })
    return this.get() as School
  }
}
