<script lang="ts">
  import { onMount } from 'svelte'
  import MacroChips from './MacroChips.svelte'
  import AddToTodayModal from './AddToTodayModal.svelte'

  let date = $state('') // the day being viewed
  let today = $state('') // the real today, for bounds + the "Today" button
  let goals = $state<Goals | null>(null)
  let totals = $state<DayTotals | null>(null)
  let entries = $state<LogEntry[]>([])
  let stats = $state<DayStats | null>(null)

  let loading = $state(true)
  let error = $state<string | null>(null)
  let addOpen = $state(false)

  // Check-in form (separate from `stats` so typing doesn't fight reloads)
  let weight = $state<number | null>(null)
  let steps = $state<number | null>(null)
  let workedOut = $state(false)
  let notes = $state('')
  let savingStats = $state(false)
  let statsSaved = $state(false)

  function readable(e: unknown): string {
    const msg = e instanceof Error ? e.message : String(e)
    return msg.split('Error: ').pop() ?? msg
  }

  const round = (n: number): number => Math.round(n)

  // The bar caps at 100% — but the CARD no longer pretends that's the
  // whole story: past the goal the fill turns amber and the overage is
  // printed underneath. Before this, 2,000/2,000 and 3,500/2,000 drew
  // an identical full bar.
  const barWidth = (part: number, whole: number): number =>
    whole > 0 ? Math.min(100, (part / whole) * 100) : 0

  // Shift a 'YYYY-MM-DD' string by N days, staying in local time.
  function shiftDate(iso: string, days: number): string {
    const [y, m, d] = iso.split('-').map(Number)
    return new Date(y, m - 1, d + days).toLocaleDateString('en-CA')
  }

  // 'YYYY-MM-DD' → "Monday, 25 August".
  // Split and rebuild rather than new Date(str): parsing a bare date
  // string is treated as UTC, which shifts the day in western timezones.
  function longDate(iso: string): string {
    if (!iso) return ''
    const [y, m, d] = iso.split('-').map(Number)
    return new Date(y, m - 1, d).toLocaleDateString(undefined, {
      weekday: 'long',
      day: 'numeric',
      month: 'long'
    })
  }

  // `target` is the day to show; omit it for today. Every query below
  // already took a date — only the UI was pinned to the current day.
  async function load(target?: string): Promise<void> {
    loading = true
    statsSaved = false
    try {
      // Re-read the real date on every load, so navigating also picks up
      // a midnight rollover if the app has been open a while.
      today = await window.api.today()
      date = target ?? today
      // Independent reads, so fire them together rather than in sequence.
      const [g, t, e, s] = await Promise.all([
        window.api.getGoals(),
        window.api.getDayTotals(date),
        window.api.listLogEntries(date),
        window.api.getDayStats(date)
      ])
      goals = g
      totals = t
      entries = e
      stats = s
      weight = s.weight_kg
      steps = s.steps
      workedOut = s.worked_out
      notes = s.notes ?? ''
      error = null
    } catch (err) {
      error = readable(err)
    } finally {
      loading = false
    }
  }

  // Only the log changed, so don't re-read the check-in and clobber
  // anything half-typed in it.
  async function refreshLog(): Promise<void> {
    try {
      const [t, e] = await Promise.all([
        window.api.getDayTotals(date),
        window.api.listLogEntries(date)
      ])
      totals = t
      entries = e
    } catch (err) {
      error = readable(err)
    }
  }

  async function removeEntry(entry: LogEntry): Promise<void> {
    try {
      await window.api.deleteLogEntry(entry.id)
      await refreshLog()
    } catch (err) {
      error = readable(err)
    }
  }

  async function saveStats(): Promise<void> {
    savingStats = true
    statsSaved = false
    try {
      stats = await window.api.saveDayStats({
        date,
        weight_kg: weight,
        steps,
        worked_out: workedOut,
        notes: notes.trim() ? notes : null
      })
      statsSaved = true
    } catch (err) {
      error = readable(err)
    } finally {
      savingStats = false
    }
  }

  // Guard the forward arrow: string comparison works on 'YYYY-MM-DD'.
  let isToday = $derived(date === today)
  let dayLabel = $derived(
    isToday ? 'Today' : date === shiftDate(today, -1) ? 'Yesterday' : longDate(date)
  )

  onMount(() => {
    load()
  })
</script>

<header class="page-head">
  <div class="titles">
    <h1>{dayLabel}</h1>
    <p class="sub">{longDate(date)}</p>
  </div>

  <div class="head-actions">
    <div class="datenav">
      <button onclick={() => load(shiftDate(date, -1))} aria-label="Previous day">&lsaquo;</button>
      <button onclick={() => load(shiftDate(date, 1))} disabled={isToday} aria-label="Next day">
        &rsaquo;
      </button>
    </div>
    {#if !isToday}
      <button class="ghost" onclick={() => load()}>Today</button>
    {/if}
    <button class="primary" onclick={() => (addOpen = true)}>+ Add food</button>
  </div>
</header>

{#if error}<p class="error-banner">{error}</p>{/if}

{#if loading}
  <div class="card"><p class="muted pad">Loading…</p></div>
{:else if goals && totals}
  <!-- ── Macro cards ─────────────────────────────────────────────── -->
  <div class="cards">
    {#each [ { key: 'cal', label: 'Calories', value: totals.calories, goal: goals.calories, unit: '' }, { key: 'protein', label: 'Protein', value: totals.protein_g, goal: goals.protein_g, unit: 'g' }, { key: 'carbs', label: 'Carbs', value: totals.carbs_g, goal: goals.carbs_g, unit: 'g' }, { key: 'fat', label: 'Fat', value: totals.fat_g, goal: goals.fat_g, unit: 'g' } ] as m (m.key)}
      {@const over = m.goal > 0 && m.value > m.goal}
      <div class="macro-card">
        <span class="macro-label"><i class="dot {m.key}"></i>{m.label}</span>
        <p class="macro-value tnum">
          {round(m.value)}<span class="macro-goal">/{round(m.goal)}{m.unit}</span>
        </p>
        <div class="track">
          <div class="fill {m.key}" class:over style="width: {barWidth(m.value, m.goal)}%"></div>
        </div>
        <!-- Always rendered so the cards don't change height when a
             value crosses its goal. -->
        <p class="overage tnum">
          {over ? `+${round(m.value - m.goal)}${m.unit} over` : ''}
        </p>
      </div>
    {/each}
  </div>

  <!-- ── Today's log ─────────────────────────────────────────────── -->
  <div class="card">
    <div class="card-head">
      <h2>{isToday ? "Today's log" : 'Log'}</h2>
      <span class="muted">{entries.length} {entries.length === 1 ? 'item' : 'items'}</span>
    </div>

    {#if entries.length === 0}
      <p class="muted pad">
        Nothing logged {isToday ? 'yet' : `on ${longDate(date)}`} — use “Add food”.
      </p>
    {:else}
      <ul>
        {#each entries as entry (entry.id)}
          <li class="row">
            <span class="ident">
              <span class="ename">{entry.name}</span>
              <!-- Manual entries have no grams, so show the meal alone. -->
              <span class="emeta">
                {entry.grams ? `${round(entry.grams)} g · ` : ''}{entry.meal}
              </span>
            </span>
            <span class="kcal tnum">{round(entry.calories)}</span>
            <MacroChips p={entry.protein_g} c={entry.carbs_g} f={entry.fat_g} />
            <button class="x" onclick={() => removeEntry(entry)} aria-label="Remove {entry.name}">
              &times;
            </button>
          </li>
        {/each}
      </ul>
    {/if}
  </div>

  <!-- ── Daily check-in ──────────────────────────────────────────── -->
  <div class="card">
    <div class="card-head">
      <h2>Daily check-in</h2>
      <span class="muted">Optional — leave anything blank</span>
    </div>

    <div class="checkin">
      <label>
        <span>Weight (kg)</span>
        <input type="number" step="any" min="0" bind:value={weight} placeholder="—" />
      </label>

      <label>
        <span>Steps</span>
        <input type="number" step="1" min="0" bind:value={steps} placeholder="—" />
      </label>

      <label class="check">
        <input type="checkbox" bind:checked={workedOut} />
        <span>Worked out today</span>
      </label>

      <label class="span-all">
        <span>How did today feel?</span>
        <textarea rows="3" bind:value={notes} placeholder="Energy, sleep, cravings, anything…"
        ></textarea>
      </label>

      <div class="checkin-actions span-all">
        <button class="primary" onclick={saveStats} disabled={savingStats}>
          {savingStats ? 'Saving…' : 'Save check-in'}
        </button>
        {#if statsSaved}<span class="ok">Saved</span>{/if}
      </div>
    </div>
  </div>
{/if}

{#if addOpen}
  <AddToTodayModal {date} {dayLabel} onclose={() => (addOpen = false)} onadded={refreshLog} />
{/if}

<style>
  .page-head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 16px;
    margin-bottom: 18px;
  }

  .titles {
    min-width: 0;
  }

  .head-actions {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-shrink: 0;
  }

  .datenav {
    display: flex;
    gap: 3px;
  }

  .datenav button {
    background: var(--surface);
    border: 1px solid var(--border-strong);
    border-radius: var(--radius-sm);
    width: 30px;
    height: 32px;
    font-size: 16px;
    line-height: 1;
    color: var(--text-2);
    cursor: pointer;
  }

  .datenav button:hover:not(:disabled) {
    background: var(--surface-hover);
    color: var(--text);
  }

  .datenav button:disabled {
    opacity: 0.4;
    cursor: default;
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

  .cards {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 12px;
    margin-bottom: 16px;
  }

  .macro-card {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 14px;
  }

  .macro-label {
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
  .dot.carbs {
    background: var(--carbs);
  }
  .dot.fat {
    background: var(--fat);
  }

  .macro-value {
    font-size: 24px;
    font-weight: 700;
    margin: 4px 0 8px;
  }

  .overage {
    min-height: 15px;
    margin-top: 5px;
    font-size: 11px;
    font-weight: 600;
    color: var(--warn);
  }

  .macro-goal {
    font-size: 12.5px;
    font-weight: 500;
    color: var(--text-3);
    margin-left: 2px;
  }

  .track {
    height: 5px;
    border-radius: 3px;
    background: var(--bg);
    overflow: hidden;
  }

  .fill {
    height: 100%;
    border-radius: 3px;
    transition: width 200ms ease;
  }
  .fill.cal {
    background: var(--cal);
  }
  .fill.protein {
    background: var(--protein);
  }
  .fill.carbs {
    background: var(--carbs);
  }
  .fill.fat {
    background: var(--fat);
  }

  /* Past the goal the colour changes, so a full bar can't be mistaken
     for "exactly on target". Matches the amber bars on Trends. */
  .fill.over {
    background: var(--warn);
  }

  .card {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 16px 18px;
    margin-bottom: 16px;
  }

  .card-head {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    margin-bottom: 8px;
  }

  h2 {
    font-size: 13px;
    font-weight: 650;
    color: var(--text-2);
  }

  .row {
    display: grid;
    grid-template-columns: 1fr auto auto auto;
    align-items: center;
    gap: 14px;
    padding: 10px 0;
    border-bottom: 1px solid var(--border);
  }

  .row:last-child {
    border-bottom: none;
  }

  .ident {
    display: flex;
    flex-direction: column;
    line-height: 1.3;
  }

  .ename {
    font-weight: 600;
    font-size: 13.5px;
  }

  .emeta {
    font-size: 11.5px;
    color: var(--text-3);
    text-transform: capitalize;
  }

  .kcal {
    font-weight: 700;
    min-width: 42px;
    text-align: right;
  }

  .x {
    background: none;
    border: none;
    color: var(--text-3);
    font-size: 17px;
    cursor: pointer;
    padding: 0 4px;
  }

  .x:hover {
    color: var(--danger);
  }

  .checkin {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 14px;
    align-items: end;
  }

  .span-all {
    grid-column: 1 / -1;
  }

  label {
    display: flex;
    flex-direction: column;
    gap: 5px;
    font-size: 12px;
    color: var(--text-2);
  }

  .check {
    flex-direction: row;
    align-items: center;
    gap: 8px;
    padding-bottom: 9px;
  }

  .check input {
    width: 16px;
    height: 16px;
    accent-color: var(--green);
  }

  input,
  textarea {
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    padding: 8px 10px;
    background: var(--surface);
    font-family: inherit;
    resize: vertical;
  }

  input:focus,
  textarea:focus {
    outline: none;
    border-color: var(--green);
  }

  .checkin-actions {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .ok {
    color: var(--green-text);
    font-size: 12.5px;
    font-weight: 600;
  }

  .muted {
    color: var(--text-3);
    font-size: 12px;
  }

  .pad {
    padding: 20px 0;
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
