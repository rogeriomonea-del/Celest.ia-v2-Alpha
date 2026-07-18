import { useEffect, useRef, type RefObject } from 'react'

/**
 * Calls `onOutside` when a pointer-down lands outside the referenced element.
 * Used to dismiss popovers (typeahead, date picker, passenger selector).
 */
export function useClickOutside<T extends HTMLElement>(
  ref: RefObject<T>,
  onOutside: () => void,
  active = true,
): void {
  const callbackRef = useRef(onOutside)
  callbackRef.current = onOutside

  useEffect(() => {
    if (!active) return
    const handler = (event: MouseEvent | TouchEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        callbackRef.current()
      }
    }
    document.addEventListener('mousedown', handler)
    document.addEventListener('touchstart', handler)
    return () => {
      document.removeEventListener('mousedown', handler)
      document.removeEventListener('touchstart', handler)
    }
  }, [active, ref])
}
