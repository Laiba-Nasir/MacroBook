import { mount } from 'svelte'

import './assets/main.css'
import { readTheme, applyTheme } from './theme'

// Apply the saved theme BEFORE mounting so the first paint is already
// correct — no flash of light mode on a dark-mode launch.
applyTheme(readTheme())

import App from './App.svelte'

const app = mount(App, {
  target: document.getElementById('app')!
})

export default app
