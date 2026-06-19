import { useState, useEffect } from 'react'
import { MIN_ITEM_SECONDS } from '../config'

/** Returns seconds remaining before the participant may commit, and whether the gate is open. */
export function useItemDwellTimer(itemStartMs: number): { secsLeft: number; ready: boolean } {
  const [secsLeft, setSecsLeft] = useState(() =>
    Math.max(0, MIN_ITEM_SECONDS - Math.floor((Date.now() - itemStartMs) / 1000)),
  )

  useEffect(() => {
    const compute = () =>
      Math.max(0, MIN_ITEM_SECONDS - Math.floor((Date.now() - itemStartMs) / 1000))

    setSecsLeft(compute())
    const id = setInterval(() => {
      const left = compute()
      setSecsLeft(left)
      if (left === 0) clearInterval(id)
    }, 500)
    return () => clearInterval(id)
  }, [itemStartMs])

  return { secsLeft, ready: secsLeft === 0 }
}
