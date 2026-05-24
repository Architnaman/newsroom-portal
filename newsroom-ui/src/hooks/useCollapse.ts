import { useState, useEffect } from "react"

export function useCollapse(pageKey: string, sections: string[]) {
  const storageKey = "nr_collapse_" + pageKey

  const [collapsed, setCollapsed] = useState<Record<string, boolean>>(() => {
    try {
      const saved = localStorage.getItem(storageKey)
      if (saved) return JSON.parse(saved)
    } catch {}
    return sections.reduce((acc, s) => ({ ...acc, [s]: false }), {})
  })

  useEffect(() => {
    localStorage.setItem(storageKey, JSON.stringify(collapsed))
  }, [collapsed])

  const toggle = (section: string) => {
    setCollapsed(prev => ({ ...prev, [section]: !prev[section] }))
  }

  const isCollapsed = (section: string) => collapsed[section] ?? false

  return { toggle, isCollapsed }
}
