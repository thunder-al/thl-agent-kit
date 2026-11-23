# Pools, packs and templates

How to write pools, connect them to each other and to your own packs. The commands below use
`roll` as short for `bun <skill-dir>/scripts/roll.ts` (or `node` with Node.js >= 22.18).

## The pieces

| piece | what it is | example |
|---|---|---|
| pool | a `.txt` file, one item per line | `pools/core/smell.txt` |
| pack | a folder of pools | `pools/core/` |
| slot | a reference to pools inside braces | `{core:smell}` |
| template | a `_name.txt` pool whose lines contain slots | `pools/rpg/_npc.txt` |
| union | a `_name.txt` pool with one slot per line | `pools/core/_sense.txt` |
| preset | a template you run by name | `@rpg/npc` runs `{rpg:_npc}` |

## Pool files

```text
# about: specific smells, often with their source
wet ash
cloves
hot iron
```

- One item per line. Leading and trailing spaces are trimmed; blank lines are ignored.
- `#` starts a comment line. A `# about: ...` line is the one-line description `--list` shows.
- The file name is the pool name: `smell.txt` -> `smell`. The folder name is the pack name.
  Both use `a-z`, `0-9` and `-` (pool files may also start with `_`, see templates).
- A line that appears twice is drawn twice as often. That is the only per-line weighting.
- Lines may contain slots; they expand when the line is drawn (up to 8 levels deep).

## Slots

A slot is `{...}` holding one or more pool references.

| slot | draws from |
|---|---|
| `{core:color}` | the `color` pool of the `core` pack |
| `{color}` | `color` in the pack of the line being expanded, else in `core` |
| `{rpg:*}` | a random pool of the `rpg` pack (not `_` pools), then a line from it |
| `{*}` | a random pool of any pack (not `_` pools), then a line from it |
| `{core:object & core:gadget}` | one of the two pools, 50/50, then a line from it |
| `{core:material 2 & rpg:material}` | about 67% / 33% |
| `{a 3 & b & c}` | 60% / 20% / 20% -- unweighted parts count as 1 |

Rules:
- Inside a slot there are only pool references, joined by `&`, each with an optional positive
  number as its weight. Literal text, nested braces and `{a|b}` are rejected.
- A short name looks in the pack of the line it is in, then in `core`. A template typed on the
  command line has no pack, so short names there reach `core` only. For any other pack, qualify the
  name: `{story:motive}`, not `{motive}`. The error message suggests the full name.
- Each pool is dealt like a shuffled deck for the whole run: nothing repeats across `-n` rolls
  until the pool runs out, then it reshuffles.

## Templates, unions and presets

A pool whose file name starts with `_` is not an anchor. It is left out of `{*}` and `{pack:*}`,
and its own line is never listed in the roll output -- only what its slots drew.

**Templates** describe a whole roll. Each line is one variant; a random line is used per roll:

```text
# about: NPC seed
role: {trade}; wants: {story:motive}; secret: {secret}
role: {story:archetype}; wants: {story:motive}; secret: {secret}
```

Prefer this labeled style (`label: {slot}; label: {slot}`) over sentences. Sentences break on
articles, plurals and clauses inside clauses; labels never do, and the model writes the prose anyway.

**Unions** treat several pools as one category list. One slot per line; each line is equally likely:

```text
# about: union of sensory pools
{core:color}
{core:light}
{core:sound}
```

For different odds, use a join with weights instead: `{core:color 2 & core:sound}`.

**Presets:** `@name` runs `{core:_name}`, and `@pack/name` runs `{pack:_name}`. So every template
file is a preset automatically: `pools/heist/_job.txt` is `@heist/job`.

## Writing good pools

- **Specific beats general.** "verdigris", not "green"; "wet ash", not "smoke"; "a bell foundry",
  not "a building". An anchor should force a choice; a vague one lets the default answer through.
- **One shape per pool.** All nouns, or all "to ..." motives, or all short scenes -- so any line
  fits any template that uses the pool. Say the shape in `# about:`.
- **No leading articles** on noun lines ("lantern", not "a lantern"), unless every line is a phrase.
- **Short phrases are fine** and often better than single words ("a dog barking two streets away").
- **Size:** at least as many lines as rolls you expect in one sitting, so the deck rarely
  reshuffles. Leaf pools: 50-300. Templates: 1-3 variants. More is fine; padding with weak lines is not.
- **No overlap between pools** used together, or the same item turns up as two different anchors.
- **Content:** your own words. No slurs, crude anatomy or sexual content. Public-domain sources
  (folklore, Polti, Propp, tarot and I Ching names) are fine when written in your own words.

## Your own packs

Keep your own packs outside the skill folder; it is replaced when the skill updates.

```text
my-pools/                 <- a pools folder: holds pack folders
  heist/                  <- a pack
    target.txt
    crew.txt
    _job.txt              <- a template: @heist/job
```

Connect them in one of two ways:

- **Always:** set `VIBE_ROLL_POOLS` to one or more pools folders, separated like `PATH`
  (`;` on Windows, `:` elsewhere): `VIBE_ROLL_POOLS=~/my-pools`.
- **For one run:** `--pack my-pools/heist`. `--pack loot=my-pools/heist` mounts it as `loot`.
  Repeat `--pack` for several packs.

Packs load in this order: shipped pools, `VIBE_ROLL_POOLS` folders, then each `--pack`.
`--only <dir>` replaces the first two: only that pools folder (plus any `--pack`) is used.

Rules:
- The same `pack:pool` in two places is an error naming both files, never a silent override.
- A user pack may add new pools to a shipped pack: `my-pools/core/weapon.txt` gives `{core:weapon}`.
- `--list` shows where each user pack comes from. `--check` validates everything that is loaded,
  including references from your packs into shipped ones.

## Worked example: a heist pack

`my-pools/heist/target.txt`:

```text
# about: what the crew is after
a crown in a glass case
the mayor's diary
a racehorse
the only key to the city archive
```

`my-pools/heist/crew.txt`:

```text
# about: who is in on it
a retired safecracker
a nervous choirboy
an actor who owes money
a guard who wants out
```

`my-pools/heist/_job.txt` mixes the new pools with shipped ones:

```text
# about: a heist job
target: {target}; crew: {crew}; place: {core:site}; twist: {rpg:complication}
target: {target}; crew: {crew} and {crew}; place: {core:site}; pressure: {game-design:pressure}
```

Inside `heist`, `{target}` and `{crew}` are short names for `heist:target` and `heist:crew`; the
shipped pools are qualified. Then:

```bash
roll --pack my-pools/heist --check            # validate
roll --pack my-pools/heist '@heist/job' -n 5  # roll
roll --pack my-pools/heist '{heist:target} + {core:animal & rpg:creature}'  # mix ad hoc
```

## Checking your work

- `roll --check` -- every slot in every loaded pool resolves; braces are balanced; no pool is
  empty. Errors show `file:line`.
- `roll --list` -- every pool with its size and `# about:` line.
- `roll '@your/template' -n 20 --hide-roll` -- read 20 results. If many feel flat, the pools need
  more specific lines, not more lines.
