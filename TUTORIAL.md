# DrowVTT Tutorial

This walkthrough covers the core OSS play loop:

1. load a map
2. calibrate the grid
3. add tokens
4. pick who the AI controls
5. run `Single (Fast)`, `Single (Tactical)`, or `Group (Tactical)`

## 1. Start the app

From [`backend/`](backend/), run:

```bash
npm start
```

Then open:

```text
http://localhost:3000/
```

## 2. Load and align a map

1. Use the map controls to load an image.
2. Set the grid size and align the map.
3. Use nudge, scale, and rotation until tokens will snap cleanly to the battlemap.

If you just want to test AI quickly, you can skip the map image and use the empty grid.

## 3. Add tokens

1. Use `Add token` to create creatures.
2. Set each token's side and size.
3. Fill in movement speed, AC, HP, notes, and statblock text as needed.

The AI turn loop depends heavily on the token statblock and movement values, so better token data generally gives better results.

## 4. Choose who the AI controls

Use the `AI controls` selector to choose one of these:

- `Monsters`
- `PCs`
- `Both`
- `None`

This controls which tokens are valid for AI turn selection and grouping.

## 5. Run a single-monster turn

### Single (Fast)

Use `Single (Fast)` when you want the fastest response.

How to use it:

1. Set `AI mode` to `Single (Fast)`.
2. Left-click one AI-controlled monster.
3. Click `Run Tactics Director`.

Behavior:

- one monster acts
- a different plain left-click switches focus to a different monster
- movement and attacks are still validated by the board rules

### Single (Tactical)

Use `Single (Tactical)` when you want the strongest single-monster tactical read.

How to use it:

1. Set `AI mode` to `Single (Tactical)`.
2. Left-click one AI-controlled monster.
3. Click `Run Tactics Director`.

This mode is slower than `Single (Fast)`, and the UI surfaces progress text while the model is working.

## 6. Run a grouped monster turn

Use `Group (Tactical)` for a coordinated turn across multiple AI-controlled monsters.

### Option A: board selection

1. Left-click one AI-controlled monster.
2. `Ctrl`-click on Windows/Linux or `Cmd`-click on macOS to add more AI-controlled monsters.
3. Once more than one monster is selected, the mode automatically switches to `Group (Tactical)`.
4. Click `Run Tactics Director`.

### Option B: token list

1. Use `Pick` on one or more AI-controlled monsters in the token list.
2. Click `Set Group From Selection`.
3. Click `Run Tactics Director`.

### Important group rules

- Only AI-controlled tokens can be part of the active group.
- Clicking a PC or other non-AI-controlled token clears the active monster group.
- `Ctrl`/`Cmd`-click adds or removes monsters from the active group.
- Group turns can apply movement traces for multiple monsters in the same response.

## 7. Read the result

After a run, DrowVTT shows:

- a `Narrator's Cue`
- movement traces
- action details
- the raw response JSON if you want to inspect it

You can:

- auto-apply the turn
- review it first
- or edit/paste JSON manually

## 8. Common tips

- If a newly added monster seems wrong, click it once to make it the current focused token.
- If you want to stop grouping and go back to one monster, plain left-click that monster.
- If the AI cannot run, check [`backend/.env`](backend/.env) and make sure `OPENAI_API_KEY` is set.

## 9. Recommended first playtest

Try this sequence:

1. Add three goblins and one PC.
2. Set `AI controls` to `Monsters`.
3. Run one goblin with `Single (Fast)`.
4. Run one goblin with `Single (Tactical)`.
5. `Ctrl`/`Cmd`-click two goblins and run `Group (Tactical)`.
6. Click the PC and confirm the monster group clears.

That covers the core OSS tactical interaction model.
