<script lang="ts">
  import { onMount } from 'svelte'
  import Modal from './Modal.svelte'
  import MacroChips from './MacroChips.svelte'

  // ── Data ──────────────────────────────────────────────────────────
  let foods = $state<FoodRow[]>([])
  let loading = $state(true)
  let listError = $state<string | null>(null)
  let search = $state('')

  // $derived recomputes whenever `foods` or `search` changes — no manual
  // wiring, and no second copy of the list to keep in sync.
  let filtered = $derived(
    foods.filter((f) => f.name.toLowerCase().includes(search.trim().toLowerCase()))
  )

  // ── Modal / form ──────────────────────────────────────────────────
  // editingId === null means "creating"; a number means "editing that row".
  // One form serves both, which is why Phase 4 didn't need a second one.
  let modalOpen = $state(false)
  let editingId = $state<number | null>(null)
  let saving = $state(false)
  let formError = $state<string | null>(null)

  let name = $state('')
  let calories = $state<number | null>(null)
  let protein = $state<number | null>(null)
  let carbs = $state<number | null>(null)
  let fat = $state<number | null>(null)

  // Electron wraps a rejected handler as
  //   "Error invoking remote method 'foods:add': Error: Name is required"
  // Keep only the part a person should read.
  function readable(e: unknown): string {
    const msg = e instanceof Error ? e.message : String(e)
    return msg.split('Error: ').pop() ?? msg
  }

  async function refresh(): Promise<void> {
    loading = true
    try {
      foods = await window.api.listFoods()
      listError = null
    } catch (e) {
      listError = readable(e)
    } finally {
      loading = false
    }
  }

  function openNew(): void {
    editingId = null
    name = ''
    calories = null
    protein = null
    carbs = null
    fat = null
    formError = null
    modalOpen = true
  }

  function openEdit(food: FoodRow): void {
    editingId = food.id
    name = food.name
    calories = food.calories
    protein = food.protein_g
    carbs = food.carbs_g
    fat = food.fat_g
    formError = null
    modalOpen = true
  }

  async function handleSubmit(event: SubmitEvent): Promise<void> {
    event.preventDefault()
    saving = true
    formError = null

    // `?? NaN` rather than `?? 0`: an empty box must FAIL main's
    // validation, not quietly store a zero.
    const payload: NewFood = {
      name,
      calories: calories ?? NaN,
      protein_g: protein ?? NaN,
      carbs_g: carbs ?? NaN,
      fat_g: fat ?? NaN
    }

    try {
      if (editingId === null) {
        await window.api.addFood(payload)
      } else {
        await window.api.updateFood(editingId, payload)
      }
      modalOpen = false
      await refresh() // re-read from SQLite; never patch the array by hand
    } catch (e) {
      // Keep the modal open and the values intact so the user can fix it.
      formError = readable(e)
    } finally {
      saving = false
    }
  }

  async function handleDelete(food: FoodRow): Promise<void> {
    // window.confirm is a real blocking dialog in Electron. Crude but
    // honest for a destructive action; a styled confirm can come later.
    if (!window.confirm(`Delete "${food.name}"? This can't be undone.`)) return
    try {
      await window.api.deleteFood(food.id)
      await refresh()
    } catch (e) {
      listError = readable(e)
    }
  }

  const round = (n: number): string => String(Math.round(n * 10) / 10)

  onMount(() => {
    refresh()
  })
</script>

<header class="page-head">
  <div>
    <h1>Foods</h1>
    <p class="sub">{foods.length} {foods.length === 1 ? 'item' : 'items'} in your library</p>
  </div>
  <button class="primary" onclick={openNew}>+ New food</button>
</header>

<div class="search">
  <input placeholder="Search foods…" bind:value={search} />
</div>

{#if listError}
  <p class="error-banner">{listError}</p>
{/if}

<div class="card">
  {#if loading}
    <p class="muted pad">Loading…</p>
  {:else if foods.length === 0}
    <p class="muted pad">No foods yet — add your first one with “New food”.</p>
  {:else if filtered.length === 0}
    <p class="muted pad">Nothing matches “{search}”.</p>
  {:else}
    <ul class="rows">
      {#each filtered as food (food.id)}
        <li class="row">
          <div class="ident">
            <span class="fname">{food.name}</span>
          </div>

          <span class="kcal tnum">{round(food.calories)}</span>
          <MacroChips p={food.protein_g} c={food.carbs_g} f={food.fat_g} />

          <button class="icon" onclick={() => openEdit(food)} aria-label="Edit {food.name}">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M4 20h4L20 8l-4-4L4 16v4z" />
            </svg>
          </button>
          <button class="icon danger" onclick={() => handleDelete(food)} aria-label="Delete {food.name}">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M4 7h16M9 7V5h6v2M6 7l1 13h10l1-13" />
            </svg>
          </button>
        </li>
      {/each}
    </ul>
  {/if}
</div>

{#if modalOpen}
  <Modal title={editingId === null ? 'New food' : 'Edit food'} onclose={() => (modalOpen = false)}>
    <!-- Horizontal form layout, per the annotation on screen 04:
         name full-width, then two-up and three-up rows instead of one
         tall column. -->
    <form id="food-form" onsubmit={handleSubmit}>
      <label class="span-2">
        <span>Name</span>
        <input bind:value={name} placeholder="e.g. Greek yogurt" required />
      </label>

      <label>
        <span>Calories (kcal)</span>
        <input type="number" step="any" min="0" bind:value={calories} required />
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

      {#if formError}
        <p class="form-error span-2">{formError}</p>
      {/if}
    </form>

    {#snippet footer()}
      <button class="ghost" onclick={() => (modalOpen = false)}>Cancel</button>
      <!-- form="food-form" lets a button outside the <form> submit it,
           which is how the footer stays in the Modal component. -->
      <button class="primary" type="submit" form="food-form" disabled={saving}>
        {saving ? 'Saving…' : 'Save food'}
      </button>
    {/snippet}
  </Modal>
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

  .search {
    margin-bottom: 14px;
  }

  .search input {
    width: 100%;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    padding: 9px 12px;
  }

  .card {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    overflow: hidden;
  }

  .rows {
    display: flex;
    flex-direction: column;
  }

  .row {
    display: grid;
    grid-template-columns: 1fr auto auto auto auto;
    align-items: center;
    gap: 14px;
    padding: 11px 16px;
    border-bottom: 1px solid var(--border);
  }

  .row:last-child {
    border-bottom: none;
  }

  .row:hover {
    background: var(--surface-hover);
  }

  .ident {
    display: flex;
    flex-direction: column;
    line-height: 1.3;
    min-width: 0;
  }

  .fname {
    font-weight: 600;
    font-size: 13.5px;
  }

  .kcal {
    font-weight: 700;
    font-size: 14px;
    min-width: 42px;
    text-align: right;
  }

  .icon {
    background: none;
    border: 1px solid var(--border);
    border-radius: 6px;
    width: 26px;
    height: 26px;
    display: grid;
    place-items: center;
    color: var(--text-2);
    cursor: pointer;
  }

  .icon:hover {
    background: var(--bg);
    color: var(--text);
  }

  .icon.danger:hover {
    color: var(--danger);
    border-color: var(--danger);
    background: var(--danger-bg);
  }

  .pad {
    padding: 28px 16px;
    text-align: center;
  }

  .muted {
    color: var(--text-3);
  }

  .error-banner {
    background: var(--danger-bg);
    color: var(--danger);
    border-radius: var(--radius-sm);
    padding: 9px 12px;
    font-size: 13px;
    margin-bottom: 12px;
  }

  form {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 12px;
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

  label input {
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    padding: 8px 10px;
    background: var(--surface);
  }

  label input:focus,
  .search input:focus {
    outline: none;
    border-color: var(--green);
  }

  .form-error {
    color: var(--danger);
    font-size: 12.5px;
  }
</style>
