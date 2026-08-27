<script lang="ts">
  import { onMount } from 'svelte'

  let range = $state<7 | 30>(7)
  let goals = $state<Goals | null>(null)
  let series = $state<DayTotals[]>([]) // oldest → newest, gaps filled
  let stats = $state<Map<string, DayStats>>(new Map())
  let loading = $state(true)
  let error = $state<string | null>(null)

  function readable(e: unknown): string {
    const msg = e instanceof Error ? e.message : String(e)
    return msg.split('Error: ').pop() ?? msg
  }

  const round = (n: number): number => Math.round(n)
  const comma = (n: number): string => round(n).toLocaleString()

  function shiftDate(iso: string, days: number): string {
    const [y, m, d] = iso.split('-').map(Number)
    return new Date(y, m - 1, d + days).toLocaleDateString('en-CA')
  }

  function weekday(iso: string): string {
    const [y, m, d] = iso.split('-').map(Number)
    return new Date(y, m - 1, d).toLocaleDateString(undefined, { weekday: 'short' })
  }

  async function load(): Promise<void> {
    loading = true
    try {
      const today = await window.api.today()
      const from = shiftDate(today, -(range - 1))
      const [g, rows, checkins] = await Promise.all([
        window.api.getGoals(),
        window.api.getRangeTotals(from, today),
        window.api.getDayStatsRange(from, today)
      ])
      goals = g
      stats = new Map(checkins.map((c) => [c.date, c]))

      // getRangeTotals only returns days that HAVE entries. A chart needs
      // every day in the range or the bars silently misrepresent time —
      // three logged days over two weeks would render as three adjacent
      // bars. So build the full range and map the totals onto it.
      const byDate = new Map(rows.map((r) => [r.date, r]))
      series = Array.from({ length: range }, (_, i) => {
        const date = shiftDate(today, -(range - 1 - i))
        return byDate.get(date) ?? { date, calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 }
      })
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

  // ── Chart geometry ────────────────────────────────────────────────
  // Drawn in a fixed viewBox coordinate space and scaled by CSS, so the
  // maths never has to know the pixel width of the window.
  const W = 720
  const H = 240
  const PAD = { top: 18, right: 52, bottom: 26, left: 8 }
  const plotW = W - PAD.left - PAD.right
  const plotH = H - PAD.top - PAD.bottom

  // Headroom above the taller of (biggest day, goal) so the goal line is
  // never flush against the top edge.
  let maxVal = $derived(
    Math.max(...series.map((d) => d.calories), goals?.calories ?? 0, 1) * 1.15
  )
  let slot = $derived(series.length ? plotW / series.length : plotW)
  let barW = $derived(Math.min(46, slot * 0.55))

  const y = (value: number, max: number): number => PAD.top + plotH * (1 - value / max)

  // 30 bars is too many labels to read — thin them out.
  let labelEvery = $derived(series.length > 10 ? Math.ceil(series.length / 7) : 1)

  // ── Check-in series ───────────────────────────────────────────────
  // Weight is plotted only where it was RECORDED. Missing days are not
  // zeros — treating them as zero would drag a line to the floor and
  // invent a weight loss that never happened. Consecutive recorded
  // points are joined, so a gap simply becomes a longer segment.
  let weightPoints = $derived(
    series
      .map((d, i) => ({ i, date: d.date, w: stats.get(d.date)?.weight_kg ?? null }))
      .filter((p): p is { i: number; date: string; w: number } => p.w !== null)
  )

  let weightMin = $derived(
    weightPoints.length ? Math.min(...weightPoints.map((p) => p.w)) : 0
  )
  let weightMax = $derived(
    weightPoints.length ? Math.max(...weightPoints.map((p) => p.w)) : 0
  )
  // A flat line still needs a band, or every point lands on the same row
  // and the chart looks broken.
  let wPad = $derived(Math.max(0.5, (weightMax - weightMin) * 0.25))
  let wLo = $derived(weightMin - wPad)
  let wHi = $derived(weightMax + wPad)

  let weightChange = $derived(
    weightPoints.length > 1 ? weightPoints[weightPoints.length - 1].w - weightPoints[0].w : null
  )

  let stepDays = $derived(series.filter((d) => (stats.get(d.date)?.steps ?? null) !== null))
  let avgSteps = $derived(
    stepDays.length
      ? stepDays.reduce((sum, d) => sum + (stats.get(d.date)?.steps ?? 0), 0) / stepDays.length
      : 0
  )
  let maxSteps = $derived(
    Math.max(...series.map((d) => stats.get(d.date)?.steps ?? 0), 1) * 1.15
  )
  let workoutDays = $derived(series.filter((d) => stats.get(d.date)?.worked_out).length)

  // Weight/steps charts are shorter than the calorie chart.
  const H2 = 170
  const plotH2 = H2 - PAD.top - PAD.bottom
  const y2 = (value: number, lo: number, hi: number): number =>
    PAD.top + plotH2 * (1 - (value - lo) / (hi - lo || 1))
  const cx = (i: number, slotW: number): number => PAD.left + slotW * i + slotW / 2

  // ── Average macro split ───────────────────────────────────────────
  // Averaged over days WITH entries, then converted to calories using the
  // Atwater factors (protein/carbs 4 kcal/g, fat 9). The split is by
  // energy, not grams — which is why fat's share looks larger than its
  // gram count suggests.
  let logged = $derived(series.filter((d) => d.calories > 0))
  let avgP = $derived(logged.length ? logged.reduce((s, d) => s + d.protein_g, 0) / logged.length : 0)
  let avgC = $derived(logged.length ? logged.reduce((s, d) => s + d.carbs_g, 0) / logged.length : 0)
  let avgF = $derived(logged.length ? logged.reduce((s, d) => s + d.fat_g, 0) / logged.length : 0)
  let splitTotal = $derived(avgP * 4 + avgC * 4 + avgF * 9)
  const share = (kcal: number, total: number): number => (total > 0 ? (kcal / total) * 100 : 0)

  onMount(() => {
    load()
  })
</script>

<header class="page-head">
  <div>
    <h1>Trends</h1>
    <p class="sub">Calorie intake vs goal</p>
  </div>

  <div class="toggle">
    <button class:on={range === 7} onclick={() => setRange(7)}>7 days</button>
    <button class:on={range === 30} onclick={() => setRange(30)}>30 days</button>
  </div>
</header>

{#if error}<p class="error-banner">{error}</p>{/if}

{#if loading}
  <div class="card"><p class="muted pad">Loading…</p></div>
{:else}
  <div class="card">
    <div class="card-head">
      <h2>Daily calories</h2>
      <span class="muted tnum">goal {comma(goals?.calories ?? 0)}</span>
    </div>

    <svg viewBox="0 0 {W} {H}" role="img" aria-label="Daily calories against goal">
      <!-- Goal line. Dashed so it reads as a threshold, not a data series. -->
      {#if goals}
        <line
          class="goal-line"
          x1={PAD.left}
          x2={W - PAD.right}
          y1={y(goals.calories, maxVal)}
          y2={y(goals.calories, maxVal)}
        />
        <text class="goal-label" x={W - PAD.right + 8} y={y(goals.calories, maxVal) + 4}>
          {comma(goals.calories)}
        </text>
      {/if}

      {#each series as day, i (day.date)}
        {@const over = goals ? day.calories > goals.calories : false}
        {@const top = y(day.calories, maxVal)}
        {@const x = PAD.left + slot * i + (slot - barW) / 2}
        <!-- Bars turn amber above the goal line: the one comparison this
             chart exists to make, readable without consulting the legend. -->
        <rect
          class="bar {over ? 'over' : 'under'}"
          {x}
          y={top}
          width={barW}
          height={Math.max(0, PAD.top + plotH - top)}
          rx="4"
        >
          <title>{day.date}: {comma(day.calories)} kcal</title>
        </rect>

        {#if i % labelEvery === 0}
          <text class="x-label" x={x + barW / 2} y={H - 8}>{weekday(day.date)}</text>
        {/if}
      {/each}

      <!-- Baseline -->
      <line class="axis" x1={PAD.left} x2={W - PAD.right} y1={PAD.top + plotH} y2={PAD.top + plotH} />
    </svg>
  </div>

  <div class="card">
    <div class="card-head">
      <h2>Weight</h2>
      {#if weightChange !== null}
        <span class="muted tnum">
          {weightChange > 0 ? '+' : ''}{Math.round(weightChange * 10) / 10} kg over {range} days
        </span>
      {/if}
    </div>

    {#if weightPoints.length === 0}
      <p class="muted pad">No weigh-ins in this range. Record one on Today.</p>
    {:else}
      <svg viewBox="0 0 {W} {H2}" role="img" aria-label="Weight over time">
        <text class="y-label" x={W - PAD.right + 8} y={y2(weightMax, wLo, wHi) + 4}>
          {Math.round(weightMax * 10) / 10}
        </text>
        <text class="y-label" x={W - PAD.right + 8} y={y2(weightMin, wLo, wHi) + 4}>
          {Math.round(weightMin * 10) / 10}
        </text>

        {#if weightPoints.length > 1}
          <polyline
            class="w-line"
            points={weightPoints
              .map((p) => `${cx(p.i, slot)},${y2(p.w, wLo, wHi)}`)
              .join(' ')}
          />
        {/if}

        {#each weightPoints as p (p.date)}
          <circle class="w-dot" cx={cx(p.i, slot)} cy={y2(p.w, wLo, wHi)} r="4">
            <title>{p.date}: {p.w} kg</title>
          </circle>
        {/each}

        {#each series as day, i (day.date)}
          {#if i % labelEvery === 0}
            <text class="x-label" x={cx(i, slot)} y={H2 - 8}>{weekday(day.date)}</text>
          {/if}
        {/each}
      </svg>
    {/if}
  </div>

  <div class="card">
    <div class="card-head">
      <h2>Activity</h2>
      <span class="muted tnum">
        {comma(avgSteps)} avg steps · worked out {workoutDays}/{range} days
      </span>
    </div>

    {#if stepDays.length === 0 && workoutDays === 0}
      <p class="muted pad">No steps or workouts recorded in this range.</p>
    {:else}
      <svg viewBox="0 0 {W} {H2}" role="img" aria-label="Steps per day">
        {#each series as day, i (day.date)}
          {@const st = stats.get(day.date)}
          {@const steps = st?.steps ?? 0}
          {@const top = y2(steps, 0, maxSteps)}
          {@const x = PAD.left + slot * i + (slot - barW) / 2}
          <rect
            class="step-bar"
            {x}
            y={top}
            width={barW}
            height={Math.max(0, PAD.top + plotH2 - top)}
            rx="4"
          >
            <title>{day.date}: {comma(steps)} steps</title>
          </rect>

          <!-- A dot under the axis marks a day you worked out, so the two
               facts read together without a second chart. -->
          {#if st?.worked_out}
            <circle class="workout-dot" cx={x + barW / 2} cy={PAD.top + plotH2 + 8} r="3" />
          {/if}

          {#if i % labelEvery === 0}
            <text class="x-label" x={x + barW / 2} y={H2 - 4}>{weekday(day.date)}</text>
          {/if}
        {/each}

        <line class="axis" x1={PAD.left} x2={W - PAD.right} y1={PAD.top + plotH2} y2={PAD.top + plotH2} />
      </svg>

      <p class="footnote">
        <i class="dot workout"></i>A dot under a day means you logged a workout.
      </p>
    {/if}
  </div>

  <div class="card">
    <div class="card-head">
      <h2>Average macro split</h2>
      <span class="muted">{range === 7 ? 'this week' : 'this month'}</span>
    </div>

    {#if splitTotal === 0}
      <p class="muted pad">Nothing logged in this range yet.</p>
    {:else}
      <div class="bar-split">
        <div class="seg protein" style="width: {share(avgP * 4, splitTotal)}%">
          {#if share(avgP * 4, splitTotal) > 8}{round(share(avgP * 4, splitTotal))}%{/if}
        </div>
        <div class="seg carbs" style="width: {share(avgC * 4, splitTotal)}%">
          {#if share(avgC * 4, splitTotal) > 8}{round(share(avgC * 4, splitTotal))}%{/if}
        </div>
        <div class="seg fat" style="width: {share(avgF * 9, splitTotal)}%">
          {#if share(avgF * 9, splitTotal) > 8}{round(share(avgF * 9, splitTotal))}%{/if}
        </div>
      </div>

      <div class="legend">
        <span><i class="dot protein"></i>Protein · {round(avgP)} g</span>
        <span><i class="dot carbs"></i>Carbs · {round(avgC)} g</span>
        <span><i class="dot fat"></i>Fat · {round(avgF)} g</span>
      </div>
      <p class="footnote">
        Averaged over {logged.length} logged {logged.length === 1 ? 'day' : 'days'}. Split is by
        calories, not grams — fat carries 9 kcal/g against 4 for protein and carbs.
      </p>
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
    margin-bottom: 10px;
  }

  h2 {
    font-size: 13px;
    font-weight: 650;
    color: var(--text-2);
  }

  svg {
    width: 100%;
    height: auto;
    display: block;
  }

  /* SVG reads the same CSS variables as everything else, so the chart
     re-themes in dark mode with no extra code. */
  .bar.under {
    fill: var(--green);
  }
  .bar.over {
    fill: var(--warn);
  }

  .goal-line {
    stroke: var(--text-3);
    stroke-width: 1.5;
    stroke-dasharray: 5 4;
  }

  .axis {
    stroke: var(--border);
    stroke-width: 1;
  }

  .w-line {
    fill: none;
    stroke: var(--protein);
    stroke-width: 2;
    stroke-linejoin: round;
  }

  .w-dot {
    fill: var(--protein);
  }

  .step-bar {
    fill: var(--carbs);
  }

  .workout-dot {
    fill: var(--green);
  }

  .goal-label,
  .y-label,
  .x-label {
    fill: var(--text-3);
    font-size: 11px;
    font-family: inherit;
  }

  .x-label {
    text-anchor: middle;
  }

  .bar-split {
    display: flex;
    height: 32px;
    border-radius: 7px;
    overflow: hidden;
    background: var(--bg);
  }

  .seg {
    display: grid;
    place-items: center;
    font-size: 11px;
    font-weight: 700;
    color: #fff;
    transition: width 180ms ease;
  }
  .seg.protein {
    background: var(--protein);
  }
  .seg.carbs {
    background: var(--carbs);
  }
  .seg.fat {
    background: var(--fat);
  }

  .legend {
    display: flex;
    gap: 16px;
    margin-top: 10px;
    font-size: 12px;
    color: var(--text-2);
  }

  .dot {
    display: inline-block;
    width: 8px;
    height: 8px;
    border-radius: 50%;
    margin-right: 6px;
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
  .dot.workout {
    background: var(--green);
  }

  .footnote {
    margin-top: 10px;
    font-size: 11.5px;
    color: var(--text-3);
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
