<script lang="ts">
  import logo from '../assets/macrobook-logo.png'

  // Shown on first run — when profile.username is still empty.
  // `ondone` hands the saved name back to App.svelte, which then swaps
  // this screen out for the app.
  let { ondone }: { ondone: (username: string) => void } = $props()

  let username = $state('')
  let saving = $state(false)
  let error = $state<string | null>(null)

  async function submit(event: SubmitEvent): Promise<void> {
    event.preventDefault()
    saving = true
    error = null
    try {
      const profile = await window.api.setUsername(username)
      ondone(profile.username)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      error = msg.split('Error: ').pop() ?? msg
    } finally {
      saving = false
    }
  }
</script>

<div class="welcome">
  <img src={logo} alt="MacroBook" />

  <p class="lead">Track what you eat and how the day felt — all stored locally on this machine.</p>

  <form onsubmit={submit}>
    <label>
      <span>What should we call you?</span>
      <input bind:value={username} placeholder="Your name" maxlength="40" required autofocus />
    </label>

    <button class="primary" type="submit" disabled={saving || !username.trim()}>
      {saving ? 'Setting up…' : 'Get started'}
    </button>

    {#if error}<p class="error">{error}</p>{/if}
  </form>

  <p class="foot">
    Nothing leaves your computer. There's no account and no server — your data lives in a single
    file you can back up or delete.
  </p>
</div>

<style>
  .welcome {
    max-width: 420px;
    margin: 0 auto;
    padding: 8vh 24px 40px;
    text-align: center;
  }

  img {
    width: 260px;
    max-width: 100%;
    height: auto;
    margin: 0 auto 18px;
    display: block;
  }

  /* Same treatment as the sidebar logo: invert flips the near-black
     wordmark to a light tint, and the hue rotation puts the green and
     orange back where they started. */
  :global(:root[data-theme='dark']) .welcome img {
    filter: invert(1) hue-rotate(180deg);
  }

  .lead {
    color: var(--text-2);
    margin-bottom: 26px;
  }

  form {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 20px;
    text-align: left;
  }

  label {
    display: flex;
    flex-direction: column;
    gap: 6px;
    font-size: 12px;
    color: var(--text-2);
    margin-bottom: 14px;
  }

  input {
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    padding: 9px 11px;
    background: var(--surface);
    font-size: 14px;
  }

  input:focus {
    outline: none;
    border-color: var(--green);
  }

  button {
    width: 100%;
  }

  .error {
    color: var(--danger);
    font-size: 12.5px;
    margin-top: 10px;
  }

  .foot {
    font-size: 11.5px;
    color: var(--text-3);
    margin-top: 18px;
    line-height: 1.5;
  }
</style>
