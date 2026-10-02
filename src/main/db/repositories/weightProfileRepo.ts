import { getDb } from '../connection'
import type { WeightProfile } from '@shared/types/entities'

interface WeightProfileRow {
  id: number
  code: string
  name: string
  payload: string
}

function toEntity(r: WeightProfileRow): WeightProfile {
  let payload: Record<string, number> = {}
  try {
    payload = JSON.parse(r.payload) as Record<string, number>
  } catch {
    payload = {}
  }
  return { id: r.id, code: r.code, name: r.name, payload }
}

export const weightProfileRepo = {
  list(): WeightProfile[] {
    const rows = getDb()
      .prepare('SELECT * FROM weight_profile ORDER BY id')
      .all() as WeightProfileRow[]
    return rows.map(toEntity)
  }
}
