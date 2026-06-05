import { useState, useEffect } from 'react'

export function useResponsive() {
  const [width, setWidth] = useState(window.innerWidth)

  useEffect(() => {
    const handler = () => setWidth(window.innerWidth)
    window.addEventListener('resize', handler)
    return () => window.removeEventListener('resize', handler)
  }, [])

  return {
    isMobile: width < 768,
    isTablet: width >= 768 && width < 1024,
    isDesktop: width >= 1024,
    width,
    // Helper: returns mobile value on mobile, desktop value on desktop
    r: (mobile: any, tablet: any, desktop: any) => {
      if (width < 768) return mobile
      if (width < 1024) return tablet
      return desktop
    }
  }
}