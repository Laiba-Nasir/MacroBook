<script lang="ts">
  import { onMount } from 'svelte'

  // Lets the sidebar update immediately when the name changes, without
  // App.svelte having to re-query the profile.
  let { onusernamechange }: { onusernamechange: (name: string) => void } = $props()

  let username = $state('')
  let savingName = $state(false)
  let nameSaved = $state(false)
  let nameError = $state<string | null>(null)

  let calories = $state<number | null>(null)
  let protein = $state<number | null>(null)
  let carbs = $state<number | null>(null)
  let fat = $state<number | null>(null)

  let loading = $state(true)
  let saving = $state(false)
  let error = $state<string | null>(null)
  let saved = $state(false)

  function readable(e: unknown): string {
    const msg = e instanceof Error ? e.message : String(e)
    return msg.split('Error: ').pop() ?? msg
  }

  // ── The calorie split ─────────────────────────────────────────────
  // Atwater factors: protein and carbs are 4 kcal/g, fat is 9 kcal/g.
  // This is why the fat bar looks small in grams but large in calories.
  let pKcal = $derived((protein ?? 0) * 4)
  let cKcal = $derived((carbs ?? 0) * 4)
  let fKcal = $derived((fat ?? 0) * 9)
  let macroKcal = $derived(pKcal + cKcal + fKcal)

  const pct = (part: number, whole: number): number => (whole > 0 ? (part / whole) * 100 : 0)

  // How the macro targets compare to the calorie target. If they don't
  // add up, the targets are internally inconsistent — worth surfacing
  // rather than letting the Today bars quietly disagree.
  let drift = $derived(macroKcal - (calories ?? 0))

  async function load(): Promise<void> {
    loading = true
    try {
      const [g, profile] = await Promise.all([window.api.getGoals(), window.api.getProfile()])
      username = profile.username
      calories = g.calories
      protein = g.protein_g
      carbs = g.carbs_g
      fat = g.fat_g
      error = null
    } catch (e) {
      error = readable(e)
    } finally {
      loading = false
    }
  }

  async function handleSubmit(event: SubmitEvent): Promise<void> {
    event.preventDefault()
    saving = true
    error = null
    saved = false
    try {
      await window.api.setGoals({
        calories: calories ?? NaN,
        protein_g: protein ?? NaN,
        carbs_g: carbs ?? NaN,
        fat_g: fat ?? NaN
      })
      saved = true
    } catch (e) {
      error = readable(e)
    } finally {
      saving = false
    }
  }

  async function saveName(event: SubmitEvent): Promise<void> {
    event.preventDefault()
    savingName = true
    nameError = null
    nameSaved = false
    try {
      const profile = await window.api.setUsername(username)
      username = profile.username
      onusernamechange(profile.username)
      nameSaved = true
    } catch (e) {
      nameError = readable(e)
    } finally {
      savingName = false
    }
  }

  const round = (n: number): number => Math.round(n)

  onMount(() => {
    load()
  })
</script>

<header class="page-head">
  <div>
    <h1>Goals</h1>
    <p class="sub">Daily targets everything else is measured against</p>
  </div>
</header>

{#if loading}
  <div class="card"><p class="muted">Loading…</p></div>
{:else}
  <div class="card">
    <h2 class="card-title">Profile</h2>
    <form onsubmit={saveName}>
      <label class="span-2">
        <span>Your name</span>
        <input bind:value={username} maxlength="40" required />
      </label>
      <div class="actions span-2">
        <button class="primary" type="submit" disabled={savingName}>
          {savingName ? 'Saving…' : 'Save name'}
        </button>
        {#if nameError}<span class="error">{nameError}</span>{/if}
        {#if nameSaved && !nameError}<span class="ok">Saved</span>{/if}
      </div>
    </form>
  </div>

  <div class="card">
    <h2 class="card-title">Daily targets</h2>
    <form onsubmit={handleSubmit}>
      <label class="span-2">
        <span>Daily calories (kcal)</span>
        <input type="number" step="any" min="1" bind:value={calories} required />
      </label>

      <label>
        <span>Protein (g)</span>
        <input type="number" step="any" min="0" bind:value={protein} required />
      </label>
      <label>
        <span>Carbs (g)</span>
        <input type="number" step="any" min="0" bind:value={carbs} required />
      </label>
      <label>
        <span>Fat (g)</span>
        <input type="number" step="any" min="0" bind:value={fat} required />
      </label>

      <div class="actions span-2">
        <button class="primary" type="submit" disabled={saving}>
          {saving ? 'Saving…' : 'Save goals'}
        </button>
        {#if error}<span class="error">{error}</span>{/if}
        {#if saved && !error}<span class="ok">Saved</span>{/if}
      </div>
    </form>
  </div>

  <div class="card">
    <div class="split-head">
      <h2>Calorie split</h2>
      <span class="muted tnum">{round(macroKcal)} kcal from macros</span>
    </div>

    <div class="bar">
      <div class="seg protein" style="width: {pct(pKcal, macroKcal)}%">
        {#if pct(pKcal, macroKcal) > 8}{round(pct(pKcal, macroKcal))}%{/if}
      </div>
      <div class="seg carbs" style="width: {pct(cKcal, macroKcal)}%">
        {#if pct(cKcal, macroKcal) > 8}{round(pct(cKcal, macroKcal))}%{/if}
      </div>
      <div class="seg fat" style="width: {pct(fKcal, macroKcal)}%">
        {#if pct(fKcal, macroKcal) > 8}{round(pct(fKcal, macroKcal))}%{/if}
      </div>
    </div>

    <div class="legend">
      <span><i class="dot protein"></i>Protein · {round(protein ?? 0)} g</span>
      <span><i class="dot carbs"></i>Carbs · {round(carbs ?? 0)} g</span>
      <span><i class="dot fat"></i>Fat · {round(fat ?? 0)} g</span>
    </div>

    {#if Math.abs(drift) > 25}
      <p class="drift">
        Your macro targets come to {round(macroKcal)} kcal, which is
        {round(Math.abs(drift))} kcal {drift > 0 ? 'above' : 'below'} your calorie target.
      </p>
    {/if}
  </div>
{/if}

<style>
  .page-head {
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

  .card {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 20px;
    margin-bottom: 16px;
  }

  h2 {
    font-size: 13px;
    font-weight: 650;
    color: var(--text-2);
  }

  .card-title {
    margin-bottom: 14px;
  }

  form {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 14px;
  }

  .span-2 {
    grid-column: 1 / -1;
  }

  label {
    display: flex;
    flex-direction: column;
    gap: 5px;
    font-size: 12px;
    color: var(--text-2);
  }

  input {
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    padding: 8px 10px;
    background: var(--surface);
  }

  input:focus {
    outline: none;
    border-color: var(--green);
  }

  .actions {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .error {
    color: var(--danger);
    font-size: 12.5px;
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

  .split-head {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    margin-bottom: 12px;
  }

  .bar {
    display: flex;
    height: 30px;
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
    transition: width 160ms ease;
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

  .drift {
    margin-top: 12px;
    font-size: 12.5px;
    color: var(--warn);
    background: var(--warn-bg);
    padding: 8px 10px;
    border-radius: var(--radius-sm);
  }
</style>
