<script lang="ts">
  import { onMount } from 'svelte'
  import MacroChips from './MacroChips.svelte'

  let range = $state<7 | 30>(7)
  let goals = $state<Goals | null>(null)
  let days = $state<DayTotals[]>([])
  // Check-ins keyed by date, so a row can look up its own without a scan.
  let checkins = $state<Map<string, DayStats>>(new Map())
  let loading = $state(true)
  let error = $state<string | null>(null)

  function readable(e: unknown): string {
    const msg = e instanceof Error ? e.message : String(e)
    return msg.split('Error: ').pop() ?? msg
  }

  const round = (n: number): number => Math.round(n)
  const comma = (n: number): string => round(n).toLocaleString()

  // Shift a 'YYYY-MM-DD' string by N days, staying in local time.
  // Rebuilt from parts rather than new Date(str), which parses a bare
  // date as UTC and lands on the wrong day in western timezones.
  function shiftDate(iso: string, days: number): string {
    const [y, m, d] = iso.split('-').map(Number)
    return new Date(y, m - 1, d + days).toLocaleDateString('en-CA')
  }

  // 'YYYY-MM-DD' → "Sun, 23 Aug"
  function shortDate(iso: string): string {
    const [y, m, d] = iso.split('-').map(Number)
    return new Date(y, m - 1, d).toLocaleDateString(undefined, {
      weekday: 'short',
      day: 'numeric',
      month: 'short'
    })
  }

  // A day counts as "on goal" within 10% either side of the calorie
  // target. Without a tolerance band almost no day would ever qualify,
  // which would make the metric useless.
  const TOLERANCE = 0.1

  function status(calories: number, goal: number): 'on' | 'over' | 'under' {
    if (goal <= 0) return 'on'
    const ratio = calories / goal
    if (ratio > 1 + TOLERANCE) return 'over'
    if (ratio < 1 - TOLERANCE) return 'under'
    return 'on'
  }

  const LABEL = { on: 'On goal', over: 'Over', under: 'Under' } as const

  // Averages are over days that actually have entries — a day you never
  // opened the app shouldn't drag your average calories toward zero.
  let avgCalories = $derived(
    days.length ? days.reduce((sum, d) => sum + d.calories, 0) / days.length : 0
  )
  let avgProtein = $derived(
    days.length ? days.reduce((sum, d) => sum + d.protein_g, 0) / days.length : 0
  )
  // "Days on goal" is out of the FULL range, not just logged days —
  // a day with no food logged is not a day you hit your target.
  let onGoalCount = $derived(
    goals ? days.filter((d) => status(d.calories, goals!.calories) === 'on').length : 0
  )

  async function load(): Promise<void> {
    loading = true
    try {
      const today = await window.api.today()
      const from = shiftDate(today, -(range - 1))
      const [g, rows, stats] = await Promise.all([
        window.api.getGoals(),
        window.api.getRangeTotals(from, today),
        window.api.getDayStatsRange(from, today)
      ])
      goals = g
      checkins = new Map(stats.map((s) => [s.date, s]))

      // A day with a weigh-in but no food logged is still a day worth
      // showing, and getRangeTotals only returns days that HAVE entries.
      // So union both date sets rather than driving off the totals alone.
      const byDate = new Map(rows.map((r) => [r.date, r]))
      const allDates = new Set([...byDate.keys(), ...checkins.keys()])
      days = [...allDates]
        .sort((a, b) => (a < b ? 1 : -1)) // newest first
        .map(
          (date) =>
            byDate.get(date) ?? { date, calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 }
        )
      error = null
    } catch (e) {
      error = readable(e)
    } finally {
      loading = false
    }
  }

  function setRange(next: 7 | 30): void {
    range = next
    load()
  }

  onMount(() => {
    load()
  })
</script>

<header class="page-head">
  <div>
    <h1>History</h1>
    <p class="sub">Last {range} days</p>
  </div>

  <div class="toggle">
    <button class:on={range === 7} onclick={() => setRange(7)}>Week</button>
    <button class:on={range === 30} onclick={() => setRange(30)}>Month</button>
  </div>
</header>

{#if error}<p class="error-banner">{error}</p>{/if}

{#if loading}
  <div class="card"><p class="muted pad">Loading…</p></div>
{:else}
  <div class="stats">
    <div class="stat">
      <span class="stat-label"><i class="dot cal"></i>Avg calories</span>
      <p class="stat-value tnum">{comma(avgCalories)}<span class="unit">kcal</span></p>
    </div>
    <div class="stat">
      <span class="stat-label"><i class="dot protein"></i>Avg protein</span>
      <p class="stat-value tnum">{round(avgProtein)}<span class="unit">g</span></p>
    </div>
    <div class="stat">
      <span class="stat-label"><i class="dot cal"></i>Days on goal</span>
      <p class="stat-value tnum">{onGoalCount}<span class="unit">/{range}</span></p>
    </div>
  </div>

  <div class="card">
    <div class="card-head">
      <h2>Daily log</h2>
      <span class="muted">{days.length} {days.length === 1 ? 'day' : 'days'} logged</span>
    </div>

    {#if days.length === 0}
      <p class="muted pad">Nothing logged in this range yet.</p>
    {:else}
      <ul>
        {#each days as day (day.date)}
          {@const st = status(day.calories, goals?.calories ?? 0)}
          {@const ci = checkins.get(day.date)}
          <li class="row">
            <div class="main">
              <span class="ident">
                <span class="date">{shortDate(day.date)}</span>
                <span class="kcal tnum">
                  {comma(day.calories)} / {comma(goals?.calories ?? 0)} kcal
                </span>
              </span>
              <MacroChips p={day.protein_g} c={day.carbs_g} f={day.fat_g} />
              <span class="pill {st}">{LABEL[st]}</span>
            </div>

            <!-- Check-in facts. Each is optional, so each is rendered only
                 if it was actually recorded — null means "not recorded",
                 which is different from zero. -->
            {#if ci && (ci.weight_kg !== null || ci.steps !== null || ci.worked_out || ci.notes)}
              <div class="checkin">
                {#if ci.weight_kg !== null}
                  <span class="fact tnum">{ci.weight_kg} kg</span>
                {/if}
                {#if ci.steps !== null}
                  <span class="fact tnum">{ci.steps.toLocaleString()} steps</span>
                {/if}
                {#if ci.worked_out}
                  <span class="fact workout">Worked out</span>
                {/if}
                {#if ci.notes}
                  <p class="notes">{ci.notes}</p>
                {/if}
              </div>
            {/if}
          </li>
        {/each}
      </ul>
    {/if}
  </div>
{/if}

<style>
  .page-head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    margin-bottom: 18px;
  }
  h1 {
    font-size: 22px;
    font-weight: 700;
  }
  .sub {
    font-size: 12.5px;
    color: var(--text-3);
    margin-top: 2px;
  }

  .toggle {
    display: flex;
    gap: 3px;
    background: var(--bg);
    padding: 3px;
    border-radius: var(--radius-sm);
  }

  .toggle button {
    background: none;
    border: none;
    border-radius: 5px;
    padding: 6px 14px;
    font-size: 12.5px;
    color: var(--text-2);
    cursor: pointer;
  }

  .toggle button.on {
    background: var(--surface);
    color: var(--text);
    font-weight: 600;
  }

  .stats {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 12px;
    margin-bottom: 16px;
  }

  .stat {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 14px;
  }

  .stat-label {
    display: flex;
    align-items: center;
    font-size: 12px;
    color: var(--text-2);
  }

  .dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    margin-right: 6px;
    display: inline-block;
  }
  .dot.cal {
    background: var(--cal);
  }
  .dot.protein {
    background: var(--protein);
  }

  .stat-value {
    font-size: 24px;
    font-weight: 700;
    margin-top: 4px;
  }

  .unit {
    font-size: 12.5px;
    font-weight: 500;
    color: var(--text-3);
    margin-left: 4px;
  }

  .card {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 16px 18px;
  }

  .card-head {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    margin-bottom: 6px;
  }

  h2 {
    font-size: 13px;
    font-weight: 650;
    color: var(--text-2);
  }

  .row {
    padding: 11px 0;
    border-bottom: 1px solid var(--border);
  }

  .main {
    display: grid;
    grid-template-columns: 1fr auto auto;
    align-items: center;
    gap: 14px;
  }

  .checkin {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px;
    margin-top: 7px;
  }

  .fact {
    font-size: 11px;
    font-weight: 600;
    color: var(--text-2);
    background: var(--bg);
    border-radius: 5px;
    padding: 2px 8px;
  }

  .fact.workout {
    color: var(--green-text);
    background: var(--green-soft);
  }

  .notes {
    flex-basis: 100%;
    font-size: 12px;
    color: var(--text-3);
    font-style: italic;
    margin-top: 2px;
  }

  .row:last-child {
    border-bottom: none;
  }

  .ident {
    display: flex;
    flex-direction: column;
    line-height: 1.35;
  }

  .date {
    font-weight: 650;
    font-size: 13.5px;
  }

  .kcal {
    font-size: 11.5px;
    color: var(--text-3);
  }

  .pill {
    padding: 3px 10px;
    border-radius: 999px;
    font-size: 11px;
    font-weight: 600;
    white-space: nowrap;
  }

  .pill.on {
    color: var(--green-text);
    background: var(--green-soft);
  }
  .pill.over {
    color: var(--warn);
    background: var(--warn-bg);
  }
  .pill.under {
    color: var(--protein);
    background: var(--protein-bg);
  }

  .muted {
    color: var(--text-3);
    font-size: 12px;
  }

  .pad {
    padding: 24px 0;
    text-align: center;
  }

  .error-banner {
    background: var(--danger-bg);
    color: var(--danger);
    border-radius: var(--radius-sm);
    padding: 9px 12px;
    font-size: 13px;
    margin-bottom: 12px;
  }
</style>
