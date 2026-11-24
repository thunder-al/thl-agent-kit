# thl-agent-kit

Agent tooling that follows the open [Agent Skills](https://agentskills.io) format, so it works in
Claude Code, Codex, Cursor, GitHub Copilot, opencode and anything else that reads `SKILL.md`.

| Skill | What it does |
|-------|--------------|
| [vibe-roll](skills/vibe-roll/SKILL.md) | Rolls random creative anchors (words, senses, motives, tarot, I Ching...) from curated pools so ideas stop collapsing to the usual LLM defaults. Needs bun or Node.js >= 22.18. |

Releases are rolling: whatever is on `main` is the current version. Update to get the latest.

## Install

### Any agent: `npx skills`

```sh
npx skills add thunder-al/thl-agent-kit
```

Pick one skill with `-s vibe-roll`, one agent with `-a claude-code` / `-a codex` / `-a cursor` /
`-a github-copilot` / `-a opencode`, or install for your user instead of the project with `-g`.
Update later with `npx skills update`.

### Claude Code

```sh
claude plugin marketplace add thunder-al/thl-agent-kit
claude plugin install vibe-roll@thl-agent-kit
```

Or inside a session: `/plugin marketplace add thunder-al/thl-agent-kit`, then `/plugin`.
Each skill is its own plugin. To update, run `claude plugin marketplace update thl-agent-kit`
or turn on auto-update for the marketplace in `/plugin`.

### Codex

```sh
codex plugin marketplace add thunder-al/thl-agent-kit
```

Then open `/plugins` in Codex and install `thl-agent-kit` (all skills in one plugin).
Update with `codex plugin marketplace upgrade thl-agent-kit`.

### Cursor

Settings -> Customize -> add a plugin **From GitHub Repository** -> `thunder-al/thl-agent-kit`,
then install `vibe-roll`. Teams can add the repo as a team marketplace instead.

### claude.ai

claude.ai takes a zip with the skill folder at its root. From a clone of this repo:

```sh
git archive --format=zip --prefix=vibe-roll/ -o dist/vibe-roll.zip HEAD:skills/vibe-roll
```

Upload `dist/vibe-roll.zip` at claude.ai -> Customize -> Skills. Code execution must be on.
To update, build and upload the zip again.

### Others

- **GitHub Copilot CLI:** `copilot skill add https://github.com/thunder-al/thl-agent-kit/tree/main/skills/vibe-roll`
- **Gemini CLI:** `gemini skills install https://github.com/thunder-al/thl-agent-kit.git --path skills/vibe-roll`
- **Manual:** copy `skills/<name>/` into your agent's skills folder (`.agents/skills/`, `.claude/skills/`, ...).

## Repo layout

```
skills/<name>/           the skills -- the only copy of their content
.claude-plugin/          Claude Code marketplace (one plugin per skill)
.cursor-plugin/          Cursor marketplace (one plugin per skill)
.agents/plugins/         Codex marketplace (whole kit as one plugin, described by plugin.json)
tests/                   tests, not shipped with the skills
tools/                   repo maintenance files, not shipped
```

## Adding a skill

1. Create `skills/<name>/SKILL.md` per the [spec](https://agentskills.io/specification);
   `name` must match the folder name.
2. Add an entry for it to `.claude-plugin/marketplace.json` (with `"skills": ["./"]`) and
   `.cursor-plugin/marketplace.json`. `npx skills` and Codex pick it up without changes.
3. Keep the description short. claude.ai documents a 200-character limit, though a 284-character
   description has uploaded fine.

## Tests

```sh
node --test tests/
bun test tests/
```

## License

[MIT](LICENSE)
