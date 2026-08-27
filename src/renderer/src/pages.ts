// The five screens from the Figma, in sidebar order.
// One list, imported by both the sidebar and the router in App.svelte,
// so navigation can't drift out of sync with what actually renders.
export type Page = 'today' | 'foods' | 'history' | 'trends' | 'goals'

export interface NavItem {
  id: Page
  label: string
  /** Which build phase delivers this screen. Drives the placeholders. */
  phase: number
}

export const NAV: NavItem[] = [
  { id: 'today', label: 'Today', phase: 10 },
  { id: 'foods', label: 'Foods', phase: 4 },
  { id: 'history', label: 'History', phase: 11 },
  { id: 'trends', label: 'Trends', phase: 12 },
  { id: 'goals', label: 'Goals', phase: 8 }
]
