<script lang="ts">
  import type { Snippet } from 'svelte'

  // A reusable centred dialog. Used by "New food" (Phase 4) and will be
  // reused by "Add to today" (Phase 9) rather than writing a second one.
  //
  // `children` and `footer` are Svelte 5 SNIPPETS — the replacement for
  // slots. The parent passes markup, this component decides where it goes.
  let {
    title,
    onclose,
    children,
    footer
  }: {
    title: string
    onclose: () => void
    children: Snippet
    footer?: Snippet
  } = $props()

  function onkeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') onclose()
  }
</script>

<svelte:window {onkeydown} />

<!-- The backdrop closes on click; the panel stops the click from
     bubbling so clicking inside doesn't dismiss it. -->
<div
  class="backdrop"
  role="presentation"
  onclick={onclose}
>
  <div
    class="panel"
    role="dialog"
    aria-modal="true"
    aria-label={title}
    onclick={(e) => e.stopPropagation()}
  >
    <header>
      <h2>{title}</h2>
      <button class="close" onclick={onclose} aria-label="Close">&times;</button>
    </header>

    <div class="body">
      {@render children()}
    </div>

    {#if footer}
      <footer>
        {@render footer()}
      </footer>
    {/if}
  </div>
</div>

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    background: rgba(20, 24, 22, 0.32);
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 24px;
    z-index: 50;
  }

  .panel {
    background: var(--surface);
    border-radius: 12px;
    box-shadow: 0 12px 40px rgba(0, 0, 0, 0.18);
    width: 100%;
    max-width: 560px;
    max-height: 100%;
    display: flex;
    flex-direction: column;
  }

  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 16px 20px;
    border-bottom: 1px solid var(--border);
  }

  h2 {
    font-size: 15px;
    font-weight: 650;
  }

  .close {
    background: none;
    border: 1px solid var(--border);
    border-radius: 6px;
    width: 26px;
    height: 26px;
    font-size: 17px;
    line-height: 1;
    color: var(--text-2);
    cursor: pointer;
  }

  .close:hover {
    background: var(--surface-hover);
  }

  .body {
    padding: 20px;
    overflow-y: auto;
  }

  footer {
    display: flex;
    justify-content: flex-end;
    gap: 10px;
    padding: 14px 20px;
    border-top: 1px solid var(--border);
    background: var(--surface-hover);
    border-radius: 0 0 12px 12px;
  }
</style>
