<script lang="ts">
  import { NAV, type Page } from '../pages'
  import { readTheme, applyTheme, type Theme } from '../theme'
  // Vite turns this into a URL at build time and copies the file into
  // the bundle — the same mechanism as the scaffold's electron.svg.
  import logo from '../assets/macrobook-logo.png'

  // `page` is the currently active screen; `onnavigate` asks App.svelte
  // to change it. The sidebar owns no state of its own.
  let {
    page,
    username,
    onnavigate
  }: { page: Page; username: string; onnavigate: (p: Page) => void } = $props()

  // Seeded from localStorage, which main.ts already applied to <html>.
  let theme = $state<Theme>(readTheme())

  function toggleTheme(): void {
    theme = theme === 'light' ? 'dark' : 'light'
    applyTheme(theme)
  }
</script>

<aside>
  <!-- The wordmark is part of the image, so there's no text beside it. -->
  <div class="brand">
    <img src={logo} alt="MacroBook" />
  </div>

  <nav>
    {#each NAV as item (item.id)}
      <button
        class="item"
        class:active={page === item.id}
        onclick={() => onnavigate(item.id)}
        aria-current={page === item.id ? 'page' : undefined}
      >
        {item.label}
      </button>
    {/each}
  </nav>

  <button class="theme" onclick={toggleTheme}>
    {theme === 'light' ? '\u263D  Dark mode' : '\u2600  Light mode'}
  </button>

  <!-- Bottom-left identity block. Username only, per the annotation —
       no email, no avatar image. Set on first run, editable on Goals.
       The initial stands in for an avatar so there's no image to host. -->
  <button class="user" onclick={() => onnavigate('goals')} title="Edit in Goals">
    <span class="avatar">{username.charAt(0).toUpperCase()}</span>
    <span class="who">
      <span class="username">{username}</span>
      <span class="status">Edit profile</span>
    </span>
  </button>
</aside>

<style>
  aside {
    width: 208px;
    flex-shrink: 0;
    background: var(--surface);
    border-right: 1px solid var(--border);
    display: flex;
    flex-direction: column;
    padding: 18px 12px;
  }

  .brand {
    padding: 2px 8px 18px;
  }

  .brand img {
    width: 100%;
    height: auto;
    display: block;
  }

  /*
   * The logo's wordmark and book outline are near-black navy, which
   * disappears against a dark surface. Inverting flips it to a light
   * tint; the extra 180deg hue rotation puts the hues back where they
   * started, so the green "Book" stays green and the bars stay
   * orange/red instead of turning magenta and cyan.
   */
  :global(:root[data-theme='dark']) .brand img {
    filter: invert(1) hue-rotate(180deg);
  }

  nav {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .item {
    text-align: left;
    background: none;
    border: none;
    border-radius: var(--radius-sm);
    padding: 8px 10px;
    color: var(--text-2);
    font-size: 13.5px;
    cursor: pointer;
  }

  .item:hover {
    background: var(--surface-hover);
    color: var(--text);
  }

  .item.active {
    background: var(--green-soft);
    color: var(--green-text);
    font-weight: 600;
  }

  .theme {
    margin-top: auto;
    text-align: left;
    background: none;
    border: none;
    border-radius: var(--radius-sm);
    padding: 8px 10px;
    color: var(--text-3);
    font-size: 12.5px;
    cursor: pointer;
  }

  .theme:hover {
    background: var(--surface-hover);
    color: var(--text);
  }

  .user {
    width: 100%;
    background: none;
    border: none;
    border-radius: var(--radius-sm);
    cursor: pointer;
    text-align: left;
    display: flex;
    align-items: center;
    gap: 9px;
    padding: 12px 8px 0;
    border-top: 1px solid var(--border);
  }

  .user:hover {
    background: var(--surface-hover);
  }

  .avatar {
    width: 24px;
    height: 24px;
    border-radius: 50%;
    background: var(--green-soft);
    color: var(--green-text);
    font-size: 11px;
    font-weight: 700;
    display: grid;
    place-items: center;
    flex-shrink: 0;
  }

  .who {
    display: flex;
    flex-direction: column;
    line-height: 1.25;
  }

  .username {
    font-size: 12.5px;
    font-weight: 600;
  }

  .status {
    font-size: 11px;
    color: var(--text-3);
  }
</style>
