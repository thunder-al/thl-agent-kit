// Black-box tests for skills/vibe-roll/scripts/roll.ts.
// Run on both runtimes: `node --test tests/` and `bun test tests/`
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdtempSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname, delimiter } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROLL = join(dirname(fileURLToPath(import.meta.url)), '..', 'skills', 'vibe-roll', 'scripts', 'roll.ts')

// VIBE_ROLL_POOLS is cleared so the developer's own packs never leak into a test
function run(args: Array<string>, env: Record<string, string> = {}) {
  const result = spawnSync(process.execPath, [ROLL, ...args], {
    encoding: 'utf8',
    env: { ...process.env, VIBE_ROLL_POOLS: '', ...env },
  })
  return { code: result.status, out: result.stdout, err: result.stderr }
}

// the "#k  text" lines of a successful run
function texts(args: Array<string>) {
  const result = run(args)
  assert.equal(result.code, 0, result.err)
  return result.out
    .split('\n')
    .filter((line) => /^#\d+ {2}/.test(line))
    .map((line) => line.replace(/^#\d+ {2}/, ''))
}

// writes { 'pack/name': 'line\nline' } into a fresh pools dir
function makePools(files: Record<string, string>) {
  const dir = mkdtempSync(join(tmpdir(), 'vibe-roll-'))

  for (const [path, body] of Object.entries(files)) {
    const [pack, name] = path.split('/')
    mkdirSync(join(dir, pack), { recursive: true })
    writeFileSync(join(dir, pack, `${name}.txt`), body + '\n')
  }

  return dir
}

test('templates and unions are expanded but not listed as anchors', () => {
  const dir = makePools({
    'core/_spark': '# about: test\nthing: {_thing}; colour: {color}',
    'core/_thing': '{core:salt}',
    'core/salt': 'salt',
    'core/color': 'ochre',
  })

  const result = run(['@spark', '--only', dir, '--seed', '1'])

  assert.equal(result.code, 0, result.err)
  assert.match(result.out, /#1 {2}thing: salt; colour: ochre/)
  assert.match(result.out, /- core:salt +salt\n +- core:color +ochre/)
  assert.doesNotMatch(result.out, /_spark|_thing/)
})

test('each pool is dealt like a deck across -n rolls', () => {
  const items = Array.from({ length: 10 }, (_, i) => `item${i}`)
  const dir = makePools({ 'core/p': items.join('\n') })

  const rolled = texts(['{p}', '-n', '30', '--only', dir, '--seed', 'abc'])

  for (let start = 0; start < 30; start += 10) {
    assert.deepEqual(rolled.slice(start, start + 10).sort(), items)
  }
})

test('a join picks its parts by weight', () => {
  const dir = makePools({ 'core/a': 'a', 'core/b': 'b', 'core/c': 'c' })

  const rolled = texts(['{a 2 & b & core:c}', '-n', '4000', '--only', dir, '--seed', '5'])
  const share = (value: string) => rolled.filter((text) => text === value).length / rolled.length

  assert.ok(Math.abs(share('a') - 0.5) < 0.03, `a: ${share('a')}`)
  assert.ok(Math.abs(share('b') - 0.25) < 0.03, `b: ${share('b')}`)
  assert.ok(Math.abs(share('c') - 0.25) < 0.03, `c: ${share('c')}`)
})

test('slots take only pool references', () => {
  const dir = makePools({ 'core/a': 'a', 'core/b': 'b' })
  const cases = ['{a|b}', '{a & {b}}', '{a 0}', '{a & }', '{}', '{an apple}']

  for (const template of cases) {
    const result = run([template, '--only', dir])
    assert.equal(result.code, 1, template)
  }
})

test('short names look in the same pack, then in core', () => {
  const dir = makePools({
    'core/color': 'core-color',
    'a/color': 'a-color',
    'a/line': '{color}',
    'b/line': '{color}',
    'b/only': 'b-only',
  })
  const roll = (template: string) => texts([template, '--only', dir, '--seed', '1'])[0]

  assert.equal(roll('{a:line}'), 'a-color')
  assert.equal(roll('{b:line}'), 'core-color')
  assert.equal(roll('{color}'), 'core-color')

  const result = run(['{only}', '--only', dir])
  assert.equal(result.code, 1)
  assert.match(result.err, /unknown pool \{only\}; did you mean \{b:only\}\?/)
})

test('--check reports every broken line with file:line and fails', () => {
  const dir = makePools({
    'g/refs': 'fine\n{g:nope}\n{g:refs & g:nope2}',
    'g/braces': '{g:refs',
    'g/empty': '# nothing here',
  })

  const result = run(['--check', '--only', dir])

  assert.equal(result.code, 1)
  assert.match(result.out, /refs\.txt:2: unknown pool \{g:nope\}/)
  assert.match(result.out, /refs\.txt:3: unknown pool \{g:nope2\}/)
  assert.match(result.out, /braces\.txt:1: unclosed "\{"/)
  assert.match(result.out, /empty\.txt: pool is empty/)
  assert.match(result.out, /4 error\(s\)/)
})

test('the shipped pools pass --check', () => {
  const result = run(['--check'])
  assert.equal(result.code, 0, result.out)
})

test('a pool that refers to itself stops at the depth limit', () => {
  const dir = makePools({ 'g/loop': 'x {g:loop}' })

  const result = run(['{g:loop}', '--only', dir])

  assert.equal(result.code, 1)
  assert.match(result.err, /nesting deeper than/)
})

test('bad arguments fail instead of being ignored', () => {
  const cases = [['-n'], ['-n', 'abc'], ['-n', '0'], ['--seed'], ['--seed', 'xyz'], ['--frob'], ['a', 'b'], ['@nope']]

  for (const args of cases) {
    assert.equal(run(args).code, 1, args.join(' '))
  }
})

// Every runtime that runs this suite must produce the same output: that is the cross-runtime check.
test('a seed reproduces the same output', () => {
  const dir = makePools({
    'g/a': 'alpha\nbravo\ncharlie\ndelta\necho',
    'g/b': 'one {g:a}\ntwo {g:a}\nthree {g:a}',
    'h/c': 'x\ny\nz',
  })

  const rolled = texts(['{g:b} / {*} / {h:*}', '-n', '4', '--only', dir, '--seed', 'c0ffee'])

  assert.deepEqual(rolled, ['one charlie / delta / y', 'three bravo / z / x', 'two echo / alpha / z', 'two echo / x / y'])
})

test('shipped pools contain no denied words', () => {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..')
  // deny.txt holds sha256 prefixes, not the words: "<16 hex>  # label"
  const denied = new Set(
    readFileSync(join(root, 'tools', 'deny.txt'), 'utf8')
      .split('\n')
      .map((line) => line.split('#')[0].trim())
      .filter((hash) => hash),
  )
  const poolsDir = join(root, 'skills', 'vibe-roll', 'pools')
  const hits: Array<string> = []

  for (const pack of readdirSync(poolsDir)) {
    for (const file of readdirSync(join(poolsDir, pack))) {
      const lines = readFileSync(join(poolsDir, pack, file), 'utf8').split('\n')

      lines.forEach((line, i) => {
        const words = line.toLowerCase().match(/[a-z]+/g) ?? []
        const hit = words.some((word) => denied.has(createHash('sha256').update(word).digest('hex').slice(0, 16)))

        if (hit) {
          hits.push(`${pack}/${file}:${i + 1}`)
        }
      })
    }
  }

  assert.deepEqual(hits, [])
})

test('user packs from VIBE_ROLL_POOLS and --pack are added to the shipped ones', () => {
  const collectionA = makePools({ 'mine/color': 'my-color', 'mine/_mix': 'x: {color}; y: {core:smell}' })
  const collectionB = makePools({ 'theirs/thing': 'a thing' })
  const env = { VIBE_ROLL_POOLS: [collectionA, collectionB].join(delimiter) }

  const mixed = run(['@mine/mix', '--seed', '1', '--hide-roll'], env)
  assert.equal(mixed.code, 0, mixed.err)
  assert.match(mixed.out, /#1 {2}x: my-color; y: \S/)

  const fromEnv = run(['{theirs:thing}', '--hide-roll'], env)
  assert.match(fromEnv.out, /#1 {2}a thing/)

  const asIs = run(['{theirs:thing}', '--hide-roll', '--pack', join(collectionB, 'theirs')])
  assert.match(asIs.out, /#1 {2}a thing/)

  const renamed = run(['{other:thing}', '--hide-roll', '--pack', `other=${join(collectionB, 'theirs')}`])
  assert.match(renamed.out, /#1 {2}a thing/)
})

test('a pool defined twice is an error, never an override', () => {
  const collection = makePools({ 'core/color': 'shadowed' })

  const result = run(['{core:color}'], { VIBE_ROLL_POOLS: collection })

  assert.equal(result.code, 1)
  assert.match(result.err, /\{core:color\} is defined twice/)
})

test('pack names are limited to a-z, 0-9 and "-"', () => {
  const collection = makePools({ 'My Pack/x': 'y' })

  const result = run(['{core:color}'], { VIBE_ROLL_POOLS: collection })

  assert.equal(result.code, 1)
  assert.match(result.err, /bad pack name "My Pack"/)
})
