"use client"

import { useTheme } from "next-themes"
import { useEffect, useState } from "react"

const DAYTIME_HOURS = { start: 6, end: 18 } // 6 AM to 6 PM

export function useAutoTheme() {
  const { theme, setTheme } = useTheme()
  const [autoThemeEnabled, setAutoThemeEnabled] = useState(true)

  useEffect(() => {
    const updateThemeBasedOnTime = () => {
      if (!autoThemeEnabled) return
      
      const now = new Date()
      const currentHour = now.getHours()
      
      // Set theme based on time of day
      const targetTheme = currentHour >= DAYTIME_HOURS.start && currentHour < DAYTIME_HOURS.end 
        ? "light" 
        : "dark"
      
      if (theme !== targetTheme) {
        setTheme(targetTheme)
      }
    }

    // Set initial theme
    updateThemeBasedOnTime()

    // Update theme every minute to handle time changes
    const interval = setInterval(updateThemeBasedOnTime, 60000)

    return () => clearInterval(interval)
  }, [setTheme, theme, autoThemeEnabled])

  return {
    autoThemeEnabled,
    setAutoThemeEnabled
  }
}