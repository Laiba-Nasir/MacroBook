<script lang="ts">
  import Sidebar from './components/Sidebar.svelte'
  import FoodsPage from './components/FoodsPage.svelte'
  import TodayPage from './components/TodayPage.svelte'
  import GoalsPage from './components/GoalsPage.svelte'
  import HistoryPage from './components/HistoryPage.svelte'
  import TrendsPage from './components/TrendsPage.svelte'
  import Welcome from './components/Welcome.svelte'
  import { onMount } from 'svelte'
  import type { Page } from './pages'

  // The whole navigation system. No router library: this is a local
  // desktop app with five screens and no URLs, so which-screen-is-showing
  // is just one piece of state.
  let page = $state<Page>('today')

  // An empty username means this copy has never been set up. Until it
  // is, the whole app is replaced by the welcome screen — there's no
  // sidebar to escape into, so the state can't be half-configured.
  let username = $state<string | null>(null)
  let ready = $state(false)

  onMount(async () => {
    try {
      username = (await window.api.getProfile()).username || null
    } finally {
      ready = true
    }
  })
</script>

{#if !ready}
  <!-- One frame at most; avoids flashing the welcome screen at someone
       who has already set their name. -->
  <div></div>
{:else if !username}
  <Welcome ondone={(name) => (username = name)} />
{:else}
<div class="shell">
  <Sidebar {page} {username} onnavigate={(p) => (page = p)} />

  <!-- Only this column scrolls; the sidebar stays put. -->
  <main>
    <div class="content">
      {#if page === 'today'}
        <TodayPage />
      {:else if page === 'foods'}
        <FoodsPage />
      {:else if page === 'history'}
        <HistoryPage />
      {:else if page === 'trends'}
        <TrendsPage />
      {:else if page === 'goals'}
        <GoalsPage onusernamechange={(name) => (username = name)} />
      {/if}
    </div>
  </main>
</div>
{/if}

<style>
  .shell {
    display: flex;
    height: 100vh;
  }

  main {
    flex: 1;
    overflow-y: auto;
    min-width: 0;
  }

  .content {
    /* Centred, not left-pinned: on a wide display the old layout left a
       narrow strip of content against a large empty margin. */
    max-width: 1180px;
    margin: 0 auto;
    padding: 26px 32px 60px;
  }

  /*
   * Everything in this app is sized in px, so on a large monitor the
   * layout got wider but the type stayed 14px and the whole thing read
   * as small. `zoom` scales the entire UI — text, padding, borders,
   * SVG charts — in one step.
   *
   * On the open web this would be the wrong tool. Here the render
   * target is a known Chromium, which makes it the simplest correct
   * one; the principled alternative is converting every px in the app
   * to rem and scaling the root font-size instead.
   */
  @media (min-width: 1500px) {
    .content {
      zoom: 1.1;
    }
  }

  @media (min-width: 1900px) {
    .content {
      zoom: 1.22;
    }
  }

  @media (min-width: 2400px) {
    .content {
      zoom: 1.35;
    }
  }
</style>
