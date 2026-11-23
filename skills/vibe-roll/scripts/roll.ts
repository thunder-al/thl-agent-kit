#!/usr/bin/env bun
// vibe-roll: fill {pack:pool} templates with random lines from plain-text pools.
// Runs on bun (preferred) or node >= 22.18 (native TS type stripping). No dependencies.
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join, dirname, relative, basename, delimiter } from 'node:path'
import { fileURLToPath } from 'node:url'

const MAX_DEPTH = 8

interface Line {
  text: string
  lineNo: number
}

interface Pool {
  pack: string
  name: string
  key: string
  file: string
  about: string | undefined
  meta: boolean
  items: Array<Line>
}

interface Pick {
  pool: string
  value: string
  depth: number
}

interface Part {
  ref: string
  weight: number
}

type Token = { kind: 'text'; text: string } | { kind: 'slot'; parts: Array<Part> }

const HELP = `vibe-roll -- random anchors for ideas

usage: bun roll.ts [<template> | @<preset>] [options]
       node roll.ts ...   (node >= 22.18)

template syntax:
  {pack:pool}   random line from pools/<pack>/<pool>.txt        e.g. {core:color}
  {pool}        pool in the same pack, else in "core"             e.g. {smell}
  {pack:*}      random pool from that pack, then a line from it
  {*}           random pool from any pack, then a line from it
  {a & b 2}     join: pick a part by weight (default 1), then a line from it
                e.g. {core:material 2 & rpg:material} is about 67% / 33%
  pool lines may contain slots too; they expand recursively (max depth ${MAX_DEPTH})

  _name.txt pools are templates and unions: left out of {*}, not listed as anchors.
  @name runs {core:_name}; @pack/name runs {pack:_name}.     e.g. @spark, @rpg/npc

options:
  -n <k>          number of rolls (default 1); each pool is dealt like a shuffled
                  deck, so nothing repeats across the rolls until the pool runs out
  --seed <hex>    reproduce a previous run (1-16 hex digits)
  --hide-roll     header says show-roll=no and anchors are not printed
  --list          list packs, pools (with sizes) and templates
  --check         check every pool line for broken slots
  --pack <path>   add one pack folder (repeatable); --pack name=path renames it
  --only <dir>    use only this pools directory: no shipped pools, no VIBE_ROLL_POOLS
  -h, --help      this help

your own packs:
  VIBE_ROLL_POOLS  extra pools directories, separated like PATH (";" on Windows,
                   ":" elsewhere); each holds pack folders, laid out like <skill>/pools
  A pool defined twice (same pack:pool in two places) is an error, never an override.`

// ---------- randomness ----------

// sfc32 (Chris Doty-Humphrey, PractRand), seeded the way PractRand does it.
function makeRng(seed: string) {
  if (!/^[0-9a-f]{1,16}$/i.test(seed)) {
    throw new Error(`bad seed "${seed}": use 1-16 hex digits`)
  }

  const hex = seed.padStart(16, '0')
  let a = 0
  let b = parseInt(hex.slice(8), 16) | 0
  let c = parseInt(hex.slice(0, 8), 16) | 0
  let d = 1

  function next() {
    const t = (a + b + d) | 0
    d = (d + 1) | 0
    a = b ^ (b >>> 9)
    b = (c + (c << 3)) | 0
    c = (((c << 21) | (c >>> 11)) + t) | 0
    return (t >>> 0) / 4294967296
  }

  for (let i = 0; i < 12; i++) {
    next()
  }

  return next
}

// ---------- pools ----------

// The pack folders inside a pools directory, sorted so a seed gives the same result everywhere.
function packsIn(dir: string) {
  return readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => ({ pack: entry.name, dir: join(dir, entry.name) }))
    .sort((x, y) => (x.pack < y.pack ? -1 : 1))
}

function loadPools(packDirs: Array<{ pack: string; dir: string }>) {
  const pools = new Map<string, Pool>()

  for (const packDir of packDirs) {
    const pack = packDir.pack

    if (!/^[a-z0-9][a-z0-9-]*$/.test(pack)) {
      throw new Error(`bad pack name "${pack}" (${packDir.dir}): use a-z, 0-9 and "-"`)
    }

    const files = readdirSync(packDir.dir)
      .filter((f) => f.endsWith('.txt'))
      .sort()

    for (const f of files) {
      const file = join(packDir.dir, f)
      const name = f.slice(0, -4)
      const pool: Pool = {
        pack,
        name,
        key: `${pack}:${name}`,
        file,
        about: undefined,
        meta: name.startsWith('_'),
        items: [],
      }
      const rawLines = readFileSync(file, 'utf8').split('\n')

      rawLines.forEach((raw, i) => {
        const text = raw.trim()
        const about = /^#\s*about:\s*(.*)$/.exec(text)

        if (about) {
          pool.about = about[1]
        } else if (text && !text.startsWith('#')) {
          pool.items.push({ text, lineNo: i + 1 })
        }
      })

      const existing = pools.get(pool.key)

      if (existing) {
        throw new Error(`{${pool.key}} is defined twice: ${existing.file} and ${file}`)
      }

      pools.set(pool.key, pool)
    }
  }

  return pools
}

// ---------- templates ----------

function tokenize(s: string) {
  const tokens: Array<Token> = []
  let text = ''
  let i = 0

  while (i < s.length) {
    if (s[i] === '}') {
      throw new Error(`unmatched "}" in: ${s}`)
    }

    if (s[i] !== '{') {
      text += s[i]
      i++
      continue
    }

    const end = s.indexOf('}', i)
    const nested = s.indexOf('{', i + 1)

    if (end === -1) {
      throw new Error(`unclosed "{" in: ${s}`)
    }

    if (nested !== -1 && nested < end) {
      throw new Error(`"{" inside a slot in: ${s}`)
    }

    if (text) {
      tokens.push({ kind: 'text', text })
      text = ''
    }

    // "{a & b 2}": pool references joined by "&", each with an optional weight
    const parts = s
      .slice(i + 1, end)
      .split('&')
      .map((part) => {
        const m = /^([\w.*:-]+)(?:\s+(\d+(?:\.\d+)?))?$/.exec(part.trim())

        if (!m || Number(m[2] ?? 1) <= 0) {
          throw new Error(`bad slot part "${part.trim()}" in: ${s} (use "pool" or "pool 2")`)
        }

        return { ref: m[1], weight: Number(m[2] ?? 1) }
      })

    tokens.push({ kind: 'slot', parts })
    i = end + 1
  }

  if (text) {
    tokens.push({ kind: 'text', text })
  }

  return tokens
}

// The pools a slot can draw from: one pool, or several for a wildcard.
// `pack` is the pack of the line being expanded; short names look there, then in core.
function resolve(pools: Map<string, Pool>, ref: string, pack: string | undefined) {
  const all = [...pools.values()]

  if (ref === '*') {
    return all.filter((p) => !p.meta)
  }

  const parts = ref.split(':')

  if (parts.length === 2 && parts[1] === '*') {
    const inPack = all.filter((p) => p.pack === parts[0] && !p.meta)

    if (inPack.length === 0) {
      throw new Error(`unknown pack in {${ref}} (see --list)`)
    }

    return inPack
  }

  const keys = parts.length === 2 ? [ref] : [`${pack ?? 'core'}:${ref}`, `core:${ref}`]

  for (const key of keys) {
    const pool = pools.get(key)

    if (pool) {
      return [pool]
    }
  }

  const similar = all.filter((p) => p.name === parts[parts.length - 1]).map((p) => `{${p.key}}`)
  const hint = similar.length > 0 ? `; did you mean ${similar.join(' or ')}?` : ' (see --list)'
  throw new Error(`unknown pool {${ref}}${hint}`)
}

function makeRoller(pools: Map<string, Pool>, rng: () => number) {
  // one shuffled deck per pool for the whole run
  const decks = new Map<string, Array<Line>>()

  function pickOne<T>(items: Array<T>) {
    return items[Math.floor(rng() * items.length)]
  }

  function draw(pool: Pool) {
    if (pool.items.length === 0) {
      throw new Error(`pool {${pool.key}} is empty`)
    }

    let deck = decks.get(pool.key)

    if (deck === undefined || deck.length === 0) {
      deck = [...pool.items]

      for (let i = deck.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1))
        const tmp = deck[i]
        deck[i] = deck[j]
        deck[j] = tmp
      }

      decks.set(pool.key, deck)
    }

    return deck.pop() as Line
  }

  return function roll(template: string) {
    const picks: Array<Pick> = []

    function expand(s: string, level: number, depth: number, pack: string | undefined) {
      if (level > MAX_DEPTH) {
        throw new Error(`nesting deeper than ${MAX_DEPTH} (a pool that refers to itself?)`)
      }

      let out = ''
      const tokens = tokenize(s)

      for (const token of tokens) {
        if (token.kind === 'text') {
          out += token.text
          continue
        }

        const total = token.parts.reduce((sum, part) => sum + part.weight, 0)
        let roll = rng() * total
        let part = token.parts[token.parts.length - 1]

        for (const candidate of token.parts) {
          roll -= candidate.weight

          if (roll < 0) {
            part = candidate
            break
          }
        }

        const pool = pickOne(resolve(pools, part.ref, pack))
        const line = draw(pool)

        // templates and unions are not anchors: only what they expand to is listed
        if (pool.meta) {
          out += expand(line.text, level + 1, depth, pool.pack)
          continue
        }

        const pick: Pick = { pool: pool.key, value: '', depth }
        picks.push(pick)
        pick.value = expand(line.text, level + 1, depth + 1, pool.pack)
        out += pick.value
      }

      return out
    }

    const text = expand(template, 0, 0, undefined)
    return { text, picks }
  }
}

// ---------- cli ----------

function main() {
  const args = process.argv.slice(2)
  let template: string | undefined
  let n = 1
  let seed: string | undefined
  const shipped = join(dirname(fileURLToPath(import.meta.url)), '..', 'pools')
  let only: string | undefined
  const extraPacks: Array<{ pack: string; dir: string }> = []
  let hide = false
  let list = false
  let check = false

  function valueAfter(i: number) {
    const value = args[i + 1]

    if (value === undefined || value.startsWith('-')) {
      throw new Error(`${args[i]} needs a value`)
    }

    return value
  }

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]

    if (arg === '-h' || arg === '--help') {
      console.log(HELP)
      return
    } else if (arg === '-n') {
      const value = valueAfter(i++)

      if (!/^[1-9]\d*$/.test(value)) {
        throw new Error(`-n needs a positive integer, got "${value}"`)
      }

      n = Number(value)
    } else if (arg === '--seed') {
      seed = valueAfter(i++)
    } else if (arg === '--only') {
      only = valueAfter(i++)
    } else if (arg === '--pack') {
      // "--pack path" uses the folder name as the pack name; "--pack name=path" renames it
      const value = valueAfter(i++)
      const named = /^([a-z0-9][a-z0-9-]*)=(.+)$/.exec(value)
      const dir = named ? named[2] : value
      extraPacks.push({ pack: named ? named[1] : basename(dir.replace(/[\\/]+$/, '')), dir })
    } else if (arg === '--hide-roll') {
      hide = true
    } else if (arg === '--list') {
      list = true
    } else if (arg === '--check') {
      check = true
    } else if (arg.startsWith('-')) {
      throw new Error(`unknown option ${arg} (see --help)`)
    } else if (template !== undefined) {
      throw new Error(`unexpected argument "${arg}": quote the template as one argument`)
    } else {
      template = arg
    }
  }

  // shipped pools, then every folder in VIBE_ROLL_POOLS, then each --pack; --only replaces the first two
  const envDirs = (process.env.VIBE_ROLL_POOLS ?? '').split(delimiter).filter((dir) => dir)
  const collections = only === undefined ? [shipped, ...envDirs] : [only]
  const allDirs = [...collections, ...extraPacks.map((packDir) => packDir.dir)]

  for (const dir of allDirs) {
    if (!existsSync(dir)) {
      throw new Error(`pools folder not found: ${dir}`)
    }
  }

  const pools = loadPools([...collections.flatMap((dir) => packsIn(dir)), ...extraPacks])

  if (check) {
    let errors = 0

    for (const pool of pools.values()) {
      const where = relative(process.cwd(), pool.file).replaceAll('\\', '/')

      if (pool.items.length === 0) {
        console.log(`${where}: pool is empty`)
        errors++
      }

      for (const line of pool.items) {
        try {
          const tokens = tokenize(line.text)

          for (const token of tokens) {
            if (token.kind === 'slot') {
              for (const part of token.parts) {
                resolve(pools, part.ref, pool.pack)
              }
            }
          }
        } catch (e) {
          console.log(`${where}:${line.lineNo}: ${(e as Error).message}`)
          errors++
        }
      }
    }

    console.log(`check: ${pools.size} pools, ${errors} error(s)`)

    if (errors > 0) {
      process.exitCode = 1
    }

    return
  }

  if (list) {
    let lastDir = ''

    for (const pool of pools.values()) {
      const dir = dirname(pool.file)

      // one header per pack folder; packs from outside the skill show where they come from
      if (dir !== lastDir) {
        console.log(dirname(dir) === shipped ? `[${pool.pack}]` : `[${pool.pack}]  ${dir}`)
        lastDir = dir
      }

      console.log(`  {${pool.key}}`.padEnd(30) + String(pool.items.length).padStart(4) + (pool.about ? `  ${pool.about}` : ''))
    }

    return
  }

  template ??= '@spark'
  let expandable = template

  if (template.startsWith('@')) {
    const parts = template.slice(1).split('/')
    expandable = parts.length === 2 ? `{${parts[0]}:_${parts[1]}}` : `{core:_${parts[0]}}`
  }

  if (seed === undefined) {
    const bytes = crypto.getRandomValues(new Uint8Array(8))
    seed = Array.from(bytes, (x) => x.toString(16).padStart(2, '0')).join('')
  }

  const roll = makeRoller(pools, makeRng(seed))
  const results = Array.from({ length: n }, () => roll(expandable))
  console.log(`vibe-roll  seed=${seed}  template=${template}  show-roll=${hide ? 'no' : 'yes'}`)

  for (const [k, result] of results.entries()) {
    console.log(`\n#${k + 1}  ${result.text}`)

    if (hide) {
      continue
    }

    for (const pick of result.picks) {
      console.log(`    ${'  '.repeat(pick.depth)}- ${pick.pool.padEnd(18)} ${pick.value}`)
    }
  }
}

try {
  main()
} catch (e) {
  console.error(`vibe-roll: ${(e as Error).message}`)
  process.exitCode = 1
}
