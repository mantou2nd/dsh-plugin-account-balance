#!/usr/bin/env node
/**
 * Install (or remove) the account-balance pill for the current DSH user.
 *
 * The plugin ships as a DSH bundle: DSH reads \`dsh.bundle.patch\` from the
 * package and applies its row insert when the package name is listed in the
 * profile's \`dsh.profile.bundles\`. This script copies the package into the
 * profile's node_modules, records that bundle name, and (for upgrades from the
 * first, hand-patched release) removes the old row from cordis.patch.yml.
 *
 *   node install.mjs                       # desktop profile (default)
 *   node install.mjs --profile web         # another profile
 *   node install.mjs --uninstall           # remove it again
 *   DSH_HOME=/custom node install.mjs      # custom DSH home
 */
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const NAME = 'dsh-plugin-account-balance'
const HERE = dirname(fileURLToPath(import.meta.url))
const SOURCE = existsSync(join(HERE, 'account-balance', 'package.json')) ? join(HERE, 'account-balance') : HERE
const HOME = process.env.DSH_HOME ?? join(homedir(), '.dsh')
const PROFILES = join(HOME, 'profiles')

const argv = process.argv.slice(2)
const flag = (name) => argv.includes(name)
const option = (name, fallback) => {
  const index = argv.indexOf(name)
  return index === -1 || argv[index + 1] === undefined ? fallback : argv[index + 1]
}

const uninstall = flag('--uninstall')
const profileName = option('--profile', process.env.DSH_PROFILE ?? (existsSync(join(PROFILES, 'desktop')) ? 'desktop' : 'web'))
const profile = join(PROFILES, profileName)
const target = join(profile, 'node_modules', NAME)
const manifestPath = join(profile, 'package.json')
const patchPath = join(profile, 'cordis.patch.yml')

if (!existsSync(manifestPath)) {
  console.error('dsh: profile not found: ' + manifestPath)
  console.error('dsh: pass --profile <name>, or set DSH_HOME / DSH_PROFILE')
  process.exit(1)
}

/** Remove this plugin's legacy row from a profile patch, keeping other insert rows. */
function stripLegacyRow(text) {
  const lines = text.split('\n')
  const at = lines.findIndex((line) => /^\s*-\s*id:\s*['"]?ui-account-balance['"]?\s*$/.test(line))
  if (at === -1) return text

  let end = at
  while (end + 1 < lines.length && /^\s{6,}\S/.test(lines[end + 1])) end += 1

  let start = at
  for (let back = at - 1; back >= 0; back -= 1) {
    if (/^#/.test(lines[back].trim())) { start = back; continue }
    break
  }

  const insertAt = (() => {
    for (let back = start - 1; back >= 0; back -= 1) {
      if (/^-\s*insert:\s*$/.test(lines[back])) return back
      if (/^\S/.test(lines[back])) return -1
    }
    return -1
  })()

  const next = lines.slice()
  next.splice(start, end - start + 1)

  if (insertAt !== -1) {
    const rowsLeft = next.slice(insertAt + 1).some((line) => /^\s{4}- /.test(line))
    if (!rowsLeft) {
      let from = insertAt
      while (from > 0 && /^#/.test(next[from - 1].trim())) from -= 1
      if (from > 0 && next[from - 1].trim() === '') from -= 1
      next.splice(from, insertAt - from + 1)
    }
  }

  return next.join('\n').replace(/\n{3,}/g, '\n\n')
}

const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
manifest.dsh = manifest.dsh ?? {}
manifest.dsh.profile = manifest.dsh.profile ?? {}
const bundles = Array.isArray(manifest.dsh.profile.bundles) ? manifest.dsh.profile.bundles : []
manifest.dsh.profile.bundles = bundles

if (uninstall) {
  manifest.dsh.profile.bundles = bundles.filter((entry) => entry !== NAME)
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n')
  rmSync(target, { recursive: true, force: true })
  console.log('dsh: removed ' + NAME + ' from ' + profileName)
  console.log('dsh: refresh the window (or restart DSH) to drop the pill')
  process.exit(0)
}

if (!existsSync(join(SOURCE, 'package.json'))) {
  console.error('dsh: package source missing: ' + SOURCE)
  process.exit(1)
}

mkdirSync(target, { recursive: true })
for (const entry of ['package.json', 'cordis.patch.yml', 'README.md', 'LICENSE', 'lib']) {
  const from = join(SOURCE, entry)
  if (existsSync(from)) cpSync(from, join(target, entry), { recursive: true })
}

if (!manifest.dsh.profile.bundles.includes(NAME)) manifest.dsh.profile.bundles.push(NAME)
writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n')

if (existsSync(patchPath)) {
  const before = readFileSync(patchPath, 'utf8')
  const after = stripLegacyRow(before)
  if (after !== before) {
    writeFileSync(patchPath, after)
    console.log('dsh: removed the legacy ui-account-balance row from cordis.patch.yml')
  }
}

console.log('dsh: installed ' + NAME + ' into profile "' + profileName + '"')
console.log('dsh:   ' + target)
console.log('dsh: bundles: ' + manifest.dsh.profile.bundles.join(', '))
console.log('dsh: refresh the window (or restart DSH) to pick it up')
