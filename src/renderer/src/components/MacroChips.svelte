<script lang="ts">
  // The protein / carbs / fat chips used on Today, Foods and History.
  // Colours come from the tokens in base.css so the code stays
  // consistent everywhere — never restyle these per-page.
  let { p, c, f }: { p: number; c: number; f: number } = $props()

  // Macros are stored as REAL, so 8 shows as "8" and 3.6 as "3.6"
  // rather than "8.0" / "3.60".
  const round = (n: number): string => String(Math.round(n * 10) / 10)
</script>

<span class="chips tnum">
  <span class="chip protein">{round(p)}P</span>
  <span class="chip carbs">{round(c)}C</span>
  <span class="chip fat">{round(f)}F</span>
</span>

<style>
  .chips {
    display: inline-flex;
    gap: 5px;
  }

  .chip {
    min-width: 34px;
    text-align: center;
    padding: 2px 7px;
    border-radius: 5px;
    font-size: 11px;
    font-weight: 600;
    white-space: nowrap;
  }

  .protein {
    color: var(--protein);
    background: var(--protein-bg);
  }
  .carbs {
    color: var(--carbs);
    background: var(--carbs-bg);
  }
  .fat {
    color: var(--fat);
    background: var(--fat-bg);
  }
</style>
