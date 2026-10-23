import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'

// Works from the repository root (lib/) and from the development copy (account-balance/lib/).
const bundleUrl = ['../lib/client.js', '../account-balance/lib/client.js']
  .map((rel) => new URL(rel, import.meta.url))
  .find((url) => existsSync(fileURLToPath(url)))
if (bundleUrl === undefined) throw new Error('client bundle not found next to the test')
const source = readFileSync(bundleUrl, 'utf8')

/** Minimal React: ordered hooks per mount, effects re-run on every commit. */
function createReact() {
  let states = []
  let refs = []
  let effects = []
  let cursor = 0
  const React = {
    useState(initial) {
      const index = cursor++
      if (!(index in states)) states[index] = initial
      return [states[index], (next) => {
        states[index] = typeof next === 'function' ? next(states[index]) : next
      }]
    },
    useRef(value) {
      const index = cursor++
      if (!(index in refs)) refs[index] = { current: value }
      return refs[index]
    },
    useEffect(effect) {
      effects[cursor++] = effect
    },
    createElement(type, props, ...children) {
      return { type, props: props ?? {}, children: children.flat() }
    },
  }
  return {
    React,
    ReactDOM: { createPortal: (element) => element },
    reset() { states = []; refs = []; effects = []; cursor = 0 },
    begin() { cursor = 0; effects = [] },
    runEffects() { for (const effect of effects) if (typeof effect === 'function') effect() },
  }
}

function createStorage() {
  const map = new Map()
  return {
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => { map.set(key, String(value)) },
    removeItem: (key) => { map.delete(key) },
    dump: () => Object.fromEntries(map),
  }
}

const runtime = createReact()
const storage = createStorage()

const balance = { current: '62.10', bonus: '2.28' }
const account = {
  calls: [],
  async getBalance(meta) {
    this.calls.push(meta)
    return { ok: true, value: { status: 'ready', value: [{ currency: 'CNY', balance: balance.current }], bonusWallets: [{ currency: 'CNY', balance: balance.bonus }] } }
  },
  async getState() {
    return { ok: true, value: { status: 'credential-stored', links: { usageUrl: 'https://platform.deepseek.com/usage', topUpUrl: 'https://platform.deepseek.com/top_up' }, attempt: null } }
  },
}

let chatNodes = []
let tokenUsage = undefined

const created = []
const sandbox = {
  document: {
    visibilityState: 'visible',
    addEventListener() {},
    removeEventListener() {},
    head: { appendChild() {} },
    body: { tag: 'body' },
    querySelector: () => null,
    createElement: (tag) => { const el = { tag, dataset: {}, textContent: '' }; created.push(el); return el },
  },
  localStorage: storage,
  console,
  Symbol,
  Number,
  Math,
  Map,
  Date,
  JSON,
  setInterval: () => 0,
  clearInterval: () => {},
  window: {
    innerWidth: 1600,
    innerHeight: 900,
    addEventListener() {},
    removeEventListener() {},
    __ModuleLoader__: { load: ({ id, factory }) => { sandbox.loaded = { id, factory } } },
  },
}
vm.createContext(sandbox)
vm.runInContext(source, sandbox, { filename: 'client.js' })

if (sandbox.loaded.id !== 'dsh-plugin-account-balance') throw new Error('bad bundle id: ' + sandbox.loaded.id)
const exports = sandbox.loaded.factory((name) => {
  if (name === 'react') return runtime.React
  if (name === 'react-dom') return runtime.ReactDOM
  throw new Error('unexpected require: ' + name)
})
if (typeof exports.apply !== 'function') throw new Error('missing apply')

const { summarize, formatCents, toCents, spendOf, latestTurn, compactTokens } = exports.__helpers
const rows = summarize({ status: 'ready', value: [{ currency: 'CNY', balance: '62.10' }], bonusWallets: [{ currency: 'CNY', balance: '2.28' }] })
if (rows.length !== 1 || rows[0].total !== 6438) throw new Error('summarize wrong: ' + JSON.stringify(rows))
if (formatCents(6438, '¥') !== '¥64.38') throw new Error('format wrong')
if (toCents('61.395') !== 6139) throw new Error('sub-cent must truncate: ' + toCents('61.395'))
if (toCents('61.399') !== 6139) throw new Error('sub-cent must truncate: ' + toCents('61.399'))
if (toCents('61.4') !== 6140) throw new Error('one decimal: ' + toCents('61.4'))
if (toCents('61') !== 6100) throw new Error('integer: ' + toCents('61'))
if (toCents('0.009') !== 0) throw new Error('under a cent: ' + toCents('0.009'))
const truncating = summarize({ status: 'ready', value: [{ currency: 'CNY', balance: '61.395' }], bonusWallets: [{ currency: 'CNY', balance: '2.285' }] })
if (truncating[0].total !== 6367) throw new Error('wallet total must truncate per part: ' + JSON.stringify(truncating))
if (spendOf([{ currency: 'CNY', total: 6301 }], { CNY: 6438 })[0].cents !== 137) throw new Error('spendOf wrong')
if (compactTokens(12_400_000) !== '12M') throw new Error('compact big')

const reading = latestTurn([
  { kind: 'assistant', turn: 1, usage: { totalTokens: 1000 } },
  { kind: 'assistant', turn: 2, usage: { totalTokens: 3000 } },
], { uncachedInputTokens: 1000, cacheReadTokens: 2000, cacheWriteTokens: 0, outputTokens: 1000 })
if (reading.turn !== 2 || reading.tokens !== 3000 || reading.share !== 0.75) throw new Error('latestTurn wrong')

let registration = null
const ctx = {
  locale: { getSnapshot: () => ({ active: 'zh-CN' }) },
  remote: { account },
  slots: {
    inject(name, callback) {
      if (name !== 'conversation.composer.dock') throw new Error('unexpected slot ' + name)
      callback()
    },
    register(options, component) {
      registration = { options, component }
      return () => {}
    },
  },
}

exports.apply(ctx)
if (created.length !== 1 || created[0].dataset.pluginCss !== 'dsh-plugin-account-balance') throw new Error('stylesheet not installed')
if (registration.options.id !== 'account-balance' || registration.options.order !== 2) throw new Error('bad registration')

const Component = registration.component
const text = (node) => {
  if (node === null || node === undefined) return ''
  if (typeof node === 'string') return node
  if (Array.isArray(node)) return node.map(text).join('')
  return text(node.children)
}

const propsFor = (sessionId, extra = {}) => ({
  sessionId,
  useChat: (selector) => selector({ legacy: { nodes: chatNodes } }),
  useProjection: (key) => (key === 'tokenUsage' ? tokenUsage : undefined),
  ...extra,
})

async function mount(label, sessionId, extra) {
  const props = propsFor(sessionId, extra)
  runtime.reset()
  runtime.begin()
  const first = Component(props)
  if (first !== null) throw new Error(label + ': expected empty first pass')
  runtime.runEffects()
  await new Promise((resolve) => setTimeout(resolve, 20))
  runtime.begin()
  const el = Component(props)
  if (el === null) throw new Error(label + ': expected a pill')
  const button = el.children[0]
  const panel = el.children[1] ?? null
  return {
    button,
    panel,
    text: text(button),
    color: button.children[0].props.style.color,
    props,
  }
}

async function openPanel(trigger, props) {
  trigger.button.props.onClick()
  runtime.begin()
  Component(props)
  runtime.runEffects()
  await new Promise((resolve) => setTimeout(resolve, 20))
  runtime.begin()
  const el = Component(props)
  return el.children[1] ?? null
}

// 1. first sight creates the baseline; the trigger is a button with no panel
const first = await mount('first', 'session-1')
if (first.button.type !== 'button') throw new Error('trigger must be a button')
if (first.button.props['aria-haspopup'] !== 'dialog' || first.button.props['aria-expanded'] !== false) throw new Error('bad aria state')
if (first.button.props.title !== undefined) throw new Error('native title should be gone')
if (first.panel !== null) throw new Error('panel must start closed')
if (first.text !== '余额 ¥64.38·会话 ¥0.00') throw new Error('trigger text: ' + first.text)

// 2. clicking opens the detail panel with the breakdown
const panelEl = await openPanel(first, first.props)
if (panelEl === null || panelEl.props.role !== 'dialog') throw new Error('panel did not open')
const panelText = text(panelEl)
for (const expected of ['账户余额', '¥64.38', '充值余额', '赠金余额', '会话消耗', '自打开这个会话起余额的减少', '刷新', '查询用量', '去充值']) {
  if (!panelText.includes(expected)) throw new Error('panel missing ' + expected + ' in: ' + panelText)
}

// 3. spending and a settled turn flow into both the trigger and the panel
balance.current = '61.35'
chatNodes = [
  { kind: 'assistant', turn: 1, usage: { totalTokens: 1000 } },
  { kind: 'assistant', turn: 2, usage: { totalTokens: 3000 } },
]
tokenUsage = { uncachedInputTokens: 1000, cacheReadTokens: 2000, cacheWriteTokens: 0, outputTokens: 1000 }
const second = await mount('second', 'session-1')
if (second.text !== '余额 ¥63.63·会话 ¥0.75·本轮 ¥0.56') throw new Error('spend text: ' + second.text)
const secondPanelEl = await openPanel(second, second.props)
const secondPanel = text(secondPanelEl)
if (!secondPanel.includes('¥0.75') || !secondPanel.includes('¥0.56') || !secondPanel.includes('3K tok · 占会话 75%')) {
  throw new Error('panel numbers: ' + secondPanel)
}

// 4. below ¥5 the balance turns red; exactly ¥5 does not
balance.current = '2.00'
const low = await mount('low', 'session-3')
if (low.color !== 'var(--dsw-alias-state-error-primary, #ec1313)') throw new Error('low balance must be red: ' + low.color)
balance.current = '2.72'
const edge = await mount('edge', 'session-4')
if (edge.color !== 'var(--dsw-alias-label-tertiary, #8b8b8b)') throw new Error('exactly ¥5.00 must not be red: ' + edge.color)

// 5. without chat props the trigger keeps working, minus the turn segment
const bare = await mount('bare', 'session-5', { useChat: undefined, useProjection: undefined })
if (bare.text.includes('本轮')) throw new Error('turn segment needs chat props: ' + bare.text)

// 6. signed out hides the pill
const restore = account.getBalance
account.getBalance = async () => ({ ok: true, value: null })
runtime.reset()
runtime.begin()
Component(propsFor('session-1'))
runtime.runEffects()
await new Promise((resolve) => setTimeout(resolve, 20))
runtime.begin()
if (Component(propsFor('session-1')) !== null) throw new Error('signed-out pill must stay hidden')
account.getBalance = restore

console.log('ok: helpers, stylesheet, registration, closed trigger, click panel, spend+turn, low-balance, optional props, signed-out')
console.log(second.text)
console.log(secondPanel.replace(/\s+/g, ' '))
