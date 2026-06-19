import { useState, useEffect } from 'react'
import { MIN_ITEM_SECONDS } from '../config'

/** Returns seconds remaining before the participant may commit, and whether the gate is open.
 *  minSeconds defaults to MIN_ITEM_SECONDS; pass the value captured at item-presentation time
 *  so live admin changes don't retroactively alter the countdown on an item already on screen. */
export function useItemDwellTimer(itemStartMs: number, minSeconds = MIN_ITEM_SECONDS): { secsLeft: number; ready: boolean } {
  const [secsLeft, setSecsLeft] = useState(() =>
    Math.max(0, minSeconds - Math.floor((Date.now() - itemStartMs) / 1000)),
  )

  useEffect(() => {
    const compute = () =>
      Math.max(0, minSeconds - Math.floor((Date.now() - itemStartMs) / 1000))

    setSecsLeft(compute())
    const id = setInterval(() => {
      const left = compute()
      setSecsLeft(left)
      if (left === 0) clearInterval(id)
    }, 500)
    return () => clearInterval(id)
  }, [itemStartMs, minSeconds])

  return { secsLeft, ready: secsLeft === 0 }
}
