// Minimum seconds a participant must view an item before committing a judgment.
// Override at deploy time with VITE_MIN_ITEM_SECONDS.
export const MIN_ITEM_SECONDS = Number(import.meta.env.VITE_MIN_ITEM_SECONDS ?? 60)
