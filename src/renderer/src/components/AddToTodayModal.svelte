<script lang="ts">
  import { onMount } from 'svelte'
  import Modal from './Modal.svelte'

  // `onadded` lets the Today page refresh itself without this component
  // knowing anything about totals or log lists.
  // `dayLabel` is what the page is calling this date ("Today",
  // "Yesterday", "Mon, 24 Aug") — the modal shouldn't say "today" while
  // you're looking at Tuesday.
  let {
    date,
    dayLabel,
    onclose,
    onadded
  }: { date: string; dayLabel: string; onclose: () => void; onadded: () => void } = $props()

  let foods = $state<FoodRow[]>([])
  let search = $state('')
  let selected = $state<FoodRow | null>(null)
  let meal = $state<MealType>('breakfast')
  let saving = $state(false)
  let error = $state<string | null>(null)

  // Two ways to log something:
  //   'search' — pick a library food, give an amount, macros get scaled
  //   'manual' — type the macros directly for a one-off (a restaurant
  //              meal, someone else's cooking) without polluting the
  //              Foods library with something you'll never eat again
  let mode = $state<'search' | 'manual'>('search')

  // Manual-entry fields. No grams here — the macros ARE the entry.
  let mName = $state('')
  let mCalories = $state<number | null>(null)
  let mProtein = $state<number | null>(null)
  let mCarbs = $state<number | null>(null)
  let mFat = $state<number | null>(null)

  const MEALS: MealType[] = ['breakfast', 'lunch', 'dinner', 'snack']

  let filtered = $derived(
    foods.filter((f) => f.name.toLowerCase().includes(search.trim().toLowerCase())).slice(0, 6)
  )

  // What logging this food will add. A food is one portion, so this is
  // simply its stored macros — shown before you commit.
  let preview = $derived(
    selected
      ? {
          calories: selected.calories,
          protein: selected.protein_g,
          carbs: selected.carbs_g,
          fat: selected.fat_g
        }
      : null
  )

  const round = (n: number): number => Math.round(n)

  function readable(e: unknown): string {
    const msg = e instanceof Error ? e.message : String(e)
    return msg.split('Error: ').pop() ?? msg
  }

  let canSubmit = $derived(mode === 'search' ? selected !== null : mName.trim().length > 0)

  async function submit(): Promise<void> {
    saving = true
    error = null
    try {
      if (mode === 'search') {
        if (!selected) throw new Error('Pick a food first')
        await window.api.addLogEntry({ food_id: selected.id, date, meal })
      } else {
        await window.api.addManualLogEntry({
          date,
          meal,
          name: mName,
          calories: mCalories ?? NaN,
          protein_g: mProtein ?? NaN,
          carbs_g: mCarbs ?? NaN,
          fat_g: mFat ?? NaN
        })
      }
      onadded()
      onclose()
    } catch (e) {
      error = readable(e)
    } finally {
      saving = false
    }
  }

  onMount(async () => {
    try {
      foods = await window.api.listFoods()
    } catch (e) {
      error = readable(e)
    }
  })
</script>

<Modal title="Add to {dayLabel.toLowerCase()}" {onclose}>
  <div class="tabs">
    <button class="tab" class:on={mode === 'search'} onclick={() => (mode = 'search')}>
      Search my foods
    </button>
    <button class="tab" class:on={mode === 'manual'} onclick={() => (mode = 'manual')}>
      Enter manually
    </button>
  </div>

{#if mode === 'search'}
  <input class="search" placeholder="Search your foods…" bind:value={search} />

  <div class="results">
    {#if foods.length === 0}
      <p class="muted">No foods in your library yet — add one on the Foods page first.</p>
    {:else if filtered.length === 0}
      <p class="muted">Nothing matches “{search}”.</p>
    {:else}
      {#each filtered as food (food.id)}
        <button
          class="result"
          class:picked={selected?.id === food.id}
          onclick={() => (selected = food)}
        >
          <span class="info">
            <span class="fname">{food.name}</span>
            <span class="per tnum">{round(food.calories)} kcal</span>
          </span>
          {#if selected?.id === food.id}<span class="tick">&#10003;</span>{/if}
        </button>
      {/each}
    {/if}
  </div>

{:else}
  <!-- Manual entry: no food, no amount. The macros are the entry. -->
  <div class="manual">
    <label class="span-4">
      <span>What did you eat?</span>
      <input bind:value={mName} placeholder="e.g. Chicken curry at Mum's" />
    </label>
    <label>
      <span>Calories</span>
      <input type="number" step="any" min="0" bind:value={mCalories} />
    </label>
    <label>
      <span>Protein (g)</span>
      <input type="number" step="any" min="0" bind:value={mProtein} />
    </label>
    <label>
      <span>Carbs (g)</span>
      <input type="number" step="any" min="0" bind:value={mCarbs} />
    </label>
    <label>
      <span>Fat (g)</span>
      <input type="number" step="any" min="0" bind:value={mFat} />
    </label>
  </div>
{/if}

  <div class="controls">
    <label>
      <span>Meal</span>
      <select bind:value={meal}>
        {#each MEALS as m (m)}
          <option value={m}>{m[0].toUpperCase() + m.slice(1)}</option>
        {/each}
      </select>
    </label>
  </div>

  {#if mode === 'search'}
  <div class="preview">
    <span class="label">This adds</span>
    {#if preview}
      <span class="numbers tnum">
        <strong>{round(preview.calories)} kcal</strong>
        <span class="chip protein">{round(preview.protein)}P</span>
        <span class="chip carbs">{round(preview.carbs)}C</span>
        <span class="chip fat">{round(preview.fat)}F</span>
      </span>
    {:else}
      <span class="muted">Pick a food</span>
    {/if}
  </div>
  {/if}

  {#if error}<p class="error">{error}</p>{/if}

  {#snippet footer()}
    <button class="ghost" onclick={onclose}>Cancel</button>
    <button class="primary" onclick={submit} disabled={saving || !canSubmit}>
      {saving ? 'Adding…' : `Add to ${dayLabel.toLowerCase()}`}
    </button>
  {/snippet}
</Modal>

<style>
  .tabs {
    display: flex;
    gap: 4px;
    background: var(--bg);
    padding: 3px;
    border-radius: var(--radius-sm);
    margin-bottom: 14px;
  }

  .tab {
    flex: 1;
    background: none;
    border: none;
    border-radius: 5px;
    padding: 7px;
    font-size: 12.5px;
    color: var(--text-2);
    cursor: pointer;
  }

  .tab.on {
    background: var(--surface);
    color: var(--text);
    font-weight: 600;
  }

  .manual {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 12px;
  }

  .span-4 {
    grid-column: 1 / -1;
  }

  .manual input {
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    padding: 8px 10px;
    background: var(--surface);
    width: 100%;
  }

  .manual input:focus {
    outline: none;
    border-color: var(--green);
  }

  .search {
    width: 100%;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    padding: 9px 12px;
    background: var(--surface);
  }

  .search:focus,
  .controls input:focus,
  .controls select:focus {
    outline: none;
    border-color: var(--green);
  }

  .results {
    margin: 12px 0 4px;
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-height: 60px;
  }

  .result {
    display: flex;
    align-items: center;
    justify-content: space-between;
    text-align: left;
    background: none;
    border: none;
    border-radius: var(--radius-sm);
    padding: 9px 11px;
    cursor: pointer;
  }

  .result:hover {
    background: var(--surface-hover);
  }

  .result.picked {
    background: var(--green-soft);
  }

  .info {
    display: flex;
    flex-direction: column;
    line-height: 1.3;
  }

  .fname {
    font-weight: 600;
    font-size: 13.5px;
    color: var(--text);
  }

  .per {
    font-size: 11.5px;
    color: var(--text-3);
  }

  .tick {
    color: var(--green-text);
    font-weight: 700;
  }

  .controls {
    display: grid;
    grid-template-columns: 1fr;
    gap: 14px;
    margin-top: 10px;
  }

  label {
    display: flex;
    flex-direction: column;
    gap: 5px;
    font-size: 12px;
    color: var(--text-2);
  }

  .amount {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .amount input {
    width: 90px;
  }

  .controls input,
  .controls select {
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    padding: 8px 10px;
    background: var(--surface);
  }

  .unit {
    color: var(--text-3);
    font-size: 12.5px;
  }

  .preview {
    display: flex;
    align-items: center;
    justify-content: space-between;
    background: var(--bg);
    border-radius: var(--radius-sm);
    padding: 12px 14px;
    margin-top: 14px;
  }

  .label {
    font-size: 12.5px;
    color: var(--text-2);
  }

  .numbers {
    display: flex;
    align-items: center;
    gap: 7px;
    font-size: 14px;
  }

  .chip {
    padding: 2px 7px;
    border-radius: 5px;
    font-size: 11px;
    font-weight: 600;
  }
  .chip.protein {
    color: var(--protein);
    background: var(--protein-bg);
  }
  .chip.carbs {
    color: var(--carbs);
    background: var(--carbs-bg);
  }
  .chip.fat {
    color: var(--fat);
    background: var(--fat-bg);
  }

  .muted {
    color: var(--text-3);
    font-size: 12.5px;
  }

  .error {
    color: var(--danger);
    font-size: 12.5px;
    margin-top: 10px;
  }
</style>
