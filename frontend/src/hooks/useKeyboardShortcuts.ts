import { useEffect } from 'react'

interface Bindings {
  onDelete?: () => void
  onRename?: () => void
  onEscape?: () => void
}

export function useKeyboardShortcuts(bindings: Bindings) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return
      if (e.key === 'Delete' || e.key === 'Backspace') bindings.onDelete?.()
      else if (e.key === 'Enter' || e.key === 'F2') bindings.onRename?.()
      else if (e.key === 'Escape') bindings.onEscape?.()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [bindings])
}

