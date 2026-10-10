import { createContext, useCallback, useContext, useState, type ReactNode } from 'react'

type Tone = 'success' | 'error' | 'info'
type ToastFn = (message: string, tone?: Tone) => void

const Ctx = createContext<ToastFn>(() => {})
export const useToast = () => useContext(Ctx)

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<{ id: number; message: string; tone: Tone }[]>([])

  const toast = useCallback<ToastFn>((message, tone = 'info') => {
    const id = Date.now() + Math.random()
    setItems((xs) => [...xs, { id, message, tone }])
    setTimeout(() => setItems((xs) => xs.filter((x) => x.id !== id)), tone === 'error' ? 6000 : 3500)
  }, [])

  return (
    <Ctx.Provider value={toast}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 top-3 z-50 flex flex-col items-center gap-2 px-4" aria-live="polite">
        {items.map((t) => (
          <div key={t.id} className={`toast toast-${t.tone}`}>{t.message}</div>
        ))}
      </div>
    </Ctx.Provider>
  )
}
