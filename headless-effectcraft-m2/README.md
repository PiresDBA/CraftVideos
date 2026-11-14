# Headless EffectCraft render helpers

Small scripts for running EffectCraft headless: open a composition, select transform
keyframes, smooth tangents, and render to MP4s with stable output names.

These helpers are aimed at the kind of batch work we do for clone tops and motion
graphic variants, where you want consistent scene/variant naming, predictable render
ranges, and minimal fuss.

Conventions
- Scripts are run from this folder with `node <script> ...`.
- The EffectCraft CLI is expected at `../.artcraft/artcraft.mjs` relative to this
  folder. If that moves, update `ARTCRAFT_CLI` / `CLI_PATH` in the script you are
  running.
- Output renders go to `./renders/` by default. If the folder does not exist it is
  created.

---

## Scripts

### render.mjs

The current default render pipeline. It:
- opens a project,
- picks the compositions to render (either from `--comps` or from the project file),
- opens each composition,
- selects transform properties (Position, Scale, Rotation, Opacity),
- smooths the selected tangents,
- renders each composition to a stable filename in `./renders`.

Example:

```bash
node render.mjs ../work/clones/ref-ycc/tops/top-s02.ecproj
node render.mjs ../work/clones/ref-ycc/tops/top-s02.ecproj --comps T02_captionA,T02_captionB
node render.mjs ../work/clones/ref-ycc/tops/top-s02.ecproj --start 0 --end 3 --resolution full --quality best --format h264
```

This is the script you usually want for a fresh headless render.

### smart-render.mjs

An earlier variant with a similar job. It is effectively another take on the same
workflow, with slightly different arg parsing and output naming. If both exist,
prefer `render.mjs` for new work unless you have a reason to use this one.

Example:

```bash
node smart-render.mjs ../work/clones/ref-ycc/tops/top-s02.ecproj
```

### cli-helper.js

A small CommonJS helper for other scripts in this folder. It wraps `spawnSync` for
the EffectCraft CLI and gives you:

- `run(...args)` — run a CLI command and return `{ ok, stdout, stderr, status }`.
- `runOrThrow(...args)` — like `run`, but throws on failure.
- `explain(...args)` — print the command without running it.

Example:

```js
const { run, runOrThrow } = require('./cli-helper');

const ok = run('cli', 'effectcraft', 'comp.open', 'T02_captionA');
if (!ok) process.exit(1);

const list = runOrThrow('cli', 'effectcraft', 'listCompositions');
console.log(list);
```

---

## Output naming

Both render scripts derive output filenames from the composition name where they can.

The expected pattern is:

```
T02_captionA
T02_captionB
T02_layerStack
T02_lowerThird
T02_motionOverMedia
```

The `splitCompoundName()` helper breaks that into:
- scene: the two-digit scene code, e.g. `02`
- variant: a friendly label, e.g. `CaptionA`, `LayerStack`, `Motion Over Media`

If the name does not match the expected pattern, the script falls back to a sanitized
composition name.

Output files are named like:

```
renders/T02_CaptionA.mp4
renders/T02_LayerStack.mp4
```

That keeps the folder sortable by scene and variant.

---

## What gets smoothed

Only whatever is selected before `selectedTangentsSmoothed()` is called.

By default, the render scripts select:
- Transform.Position
- Transform.Scale
- Transform.Rotation
- Transform.Opacity

If you want different properties, change the selection list in the script you are
using. If you need more control, open the project in the GUI first, set up the
selection/keyframes you want, then run the render script.

---

## Known limitations

- Headless tangent smoothing only affects the selected keyframes. If a property has no
  keyframes, it is effectively a no-op.
- The CLI selection model is property-path based. If the comp uses unusual property
  names or nested properties, the default selection list may miss some of them.
- Render output uses the render settings currently stored on the project/comp. Flags
  like `--resolution`, `--quality`, `--format`, `--start`, and `--end` help, but if
  you need deeper control, set render settings before running the script or extend the
  CLI invocation.
- These scripts assume the project can be opened and rendered headless. If a project
  relies on GUI-only state, interactive panels, or unavailable fonts/media, it may
  render differently from the GUI.
- Media and footage paths must be resolvable by the EffectCraft session. Relative
  paths in the project may behave differently depending on the working directory.

---

## Windows notes

- Run from Git Bash, cmd, or PowerShell. If you use PowerShell and see quoting issues,
  try Git Bash or cmd first.
- If the CLI path is not found, check that `.artcraft/artcraft.mjs` exists relative to
  this folder.
- If `node` is not on your PATH in the shell you are using, use the full path to Node
  or run the script from a shell where `node` works.
- Windows file locks can be annoying. If a render fails because the project or output
  is locked, close any GUI session that has the same project open.

---

## Troubleshooting

**“Project file not found”**
- Check the path you passed. The scripts resolve paths relative to this folder, so
  `../work/...` is often what you want rather than a plain `work/...`.

**CLI not found**
- Confirm `.artcraft/artcraft.mjs` exists.
- Try running a trivial CLI command from the same shell to see whether the dispatcher
  works at all.

**No compositions rendered**
- If you did not pass `--comps`, the script tries to read comps from the project file.
  If that fails, it will error out rather than silently render nothing.

**Tangents not smoothed**
- Open the comp in the GUI and check whether the expected properties actually have
  keyframes.
- Confirm the selection list matches the property names used in the project.
- Try rendering without smoothing first, then add smoothing once the basic render
  works.

**Output looks unchanged**
- Smooth only changes selected tangents. If the selected properties already had linear
  or similar interpolation, the visible change may be subtle.
- Check `./renders/` for the output file and compare file size/timecode against a known
  good render.

**Render fails with a non-zero exit**
- Look at the CLI output in the terminal. The script passes through `stdio`, so the
  EffectCraft CLI usually tells you what went wrong.
- If the failure is about missing footage, fonts, or effects, fix those first.

---

If you only want to render a few tops quickly, start with `render.mjs` and the
`--comps` flag. If you want a more custom selection/smoothing workflow, use
`cli-helper.js` from your own script and build on top of it.
