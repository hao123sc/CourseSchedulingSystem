import { create } from 'zustand'

export type ToastTone = 'success' | 'error' | 'info'
export interface Toast {
  id: number
  tone: ToastTone
  message: string
}

interface ToastState {
  toasts: Toast[]
  push: (tone: ToastTone, message: string) => void
  dismiss: (id: number) => void
}

let seq = 1

export const useToastStore = create<ToastState>((set) => ({
  toasts: [],
  push: (tone, message) => {
    const id = seq++
    set((s) => ({ toasts: [...s.toasts, { id, tone, message }] }))
    setTimeout(() => {
      set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }))
    }, 3500)
  },
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }))
}))

export const toast = {
  success: (m: string): void => useToastStore.getState().push('success', m),
  error: (m: string): void => useToastStore.getState().push('error', m),
  info: (m: string): void => useToastStore.getState().push('info', m)
}
