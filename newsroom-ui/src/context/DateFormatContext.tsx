import { createContext, useContext, useEffect, useState, ReactNode } from 'react'
import { supabase } from '../lib/supabase'

type WeekStart = 'monday' | 'sunday'

interface DateFormatContextType {
  dateFormat: string
  weekStartDay: WeekStart
  formatDate: (dateStr: string) => string
  getWeekStart: (date?: Date) => string
  getWeekDates: () => Record<string, string>
  loading: boolean
}

const DateFormatContext = createContext<DateFormatContextType>({
  dateFormat: 'DD MMM YYYY',
  weekStartDay: 'monday',
  formatDate: (d) => d,
  getWeekStart: () => '',
  getWeekDates: () => ({}),
  loading: true,
})

export function applyFormat(dateStr: string, format: string): string {
  if (!dateStr) return ''
  const d = new Date(dateStr.includes('T') ? dateStr : dateStr + 'T00:00:00')
  if (isNaN(d.getTime())) return dateStr
  const dd = String(d.getDate()).padStart(2, '0')
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const yyyy = String(d.getFullYear())
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
  const mmm = months[d.getMonth()]
  const fullMonths = ['January','February','March','April','May','June','July','August','September','October','November','December']
  const mmmm = fullMonths[d.getMonth()]
  switch (format) {
    case 'DD/MM/YYYY':    return `${dd}/${mm}/${yyyy}`
    case 'MM/DD/YYYY':    return `${mm}/${dd}/${yyyy}`
    case 'DD MMM YYYY':   return `${dd} ${mmm} ${yyyy}`
    case 'MMM DD YYYY':   return `${mmm} ${dd} ${yyyy}`
    case 'YYYY-MM-DD':    return `${yyyy}-${mm}-${dd}`
    case 'DD-MM-YYYY':    return `${dd}-${mm}-${yyyy}`
    case 'MMMM DD YYYY':  return `${mmmm} ${dd}, ${yyyy}`
    default:              return `${dd} ${mmm} ${yyyy}`
  }
}

export function DateFormatProvider({ children }: { children: ReactNode }) {
  const [dateFormat, setDateFormat] = useState('DD MMM YYYY')
  const [weekStartDay, setWeekStartDay] = useState<WeekStart>('monday')
  const [loading, setLoading] = useState(true)

  async function fetchSettings() {
    const { data } = await supabase.from('app_settings').select('*')
    if (data) {
      data.forEach((s: any) => {
        if (s.key === 'date_format') setDateFormat(s.value)
        if (s.key === 'week_start_day') setWeekStartDay(s.value as WeekStart)
      })
    }
    setLoading(false)
  }

  useEffect(() => {
    fetchSettings()
    const channel = supabase.channel('app_settings_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'app_settings' }, fetchSettings)
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [])

  function formatDate(dateStr: string): string {
    return applyFormat(dateStr, dateFormat)
  }

  function getWeekStart(date: Date = new Date()): string {
    const d = new Date(date)
    const day = d.getDay()
    let diff: number
    if (weekStartDay === 'monday') {
      diff = d.getDate() - day + (day === 0 ? -6 : 1)
    } else {
      diff = d.getDate() - day
    }
    d.setDate(diff)
    return d.toISOString().split('T')[0]
  }

  function getWeekDates(): Record<string, string> {
    const days = weekStartDay === 'monday'
      ? ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
      : ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
    const weekStart = getWeekStart()
    const dates: Record<string, string> = {}
    const d = new Date(weekStart + 'T00:00:00Z')
    days.forEach((day, i) => {
      const date = new Date(d)
      date.setUTCDate(d.getUTCDate() + i)
      dates[day] = date.toISOString().split('T')[0]
    })
    return dates
  }

  return (
    <DateFormatContext.Provider value={{
      dateFormat, weekStartDay,
      formatDate, getWeekStart, getWeekDates, loading
    }}>
      {children}
    </DateFormatContext.Provider>
  )
}

export const useDateFormat = () => useContext(DateFormatContext)