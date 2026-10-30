# RiddimTing · Baby Freakout

Make a beat. Make baby freak out.

An open-source browser rhythm, bass and dub studio for [babyfreakout.com](https://babyfreakout.com). Easy Studio, a hardware-style Instrument view, and a Ting voice desk share one music session. The Baby Freakout landing page celebrates a DJ and his dancing partner.

## Run locally

Requires Node.js 22+ and Python 3. No package installation is needed.

```sh
npm run build
npm test
npm start
```

Open http://127.0.0.1:4380 and choose **Make some noise**. Audio starts after a user gesture. Install the instrument from `/app/` using a browser's Install/Add to Dock option. Wait for **Ready offline** before disconnecting.

## Make music

- 9 sessions, 4 groups × 12 pads, patterns, scenes, song arrangement, live overdub and step editing.
- 46 recreated synthesis presets and 39 hosted recreated samples, keys/scales, repeat/arpeggio, sample import/capture, chop, stretch and resampling.
- Seven send effects, twelve reconstructed punch controls, automation, loop performance, sidechain and output compression.
- Ting voice processing, four sample slots, and editable/importable JSON effect chains.
- Local project backup, WAV rendering, performance recording, and a portable HTML instrument.

Your sessions and recordings stay in browser storage unless you download or share them. The app has no account, analytics, upload service or project backend. Static hosting providers can keep normal access logs. **Save project** and **Save HTML** include all nine sessions and imported samples; check the contents and sound licences before sharing.

## Source and builds

`app/` contains the buildless Web Audio instrument. `site/` contains the Baby Freakout page and HTML guide. `scripts/build.mjs` produces `dist/`, versions the offline cache, and creates `dist/downloads/RiddimTing.html` with a clean demo snapshot. Build output is ignored by Git. `.openai/hosting.json` identifies the static hosting project; it contains no credentials.

CI runs deterministic operation tests and public-release checks, then builds a downloadable website artifact. Successful pushes to `main` publish that artifact to GitHub Pages at babyfreakout.com. Pull requests run checks without publishing. The earlier Sites deployment remains a fallback mirror; `.openai/hosting.json` retains its identity for deliberate mirror updates.

## Fidelity and licences

This independent project is inspired by the EP–40 and Ting workflow. It is not affiliated with or endorsed by Teenage Engineering. Hardware names are used only to identify the reference devices. It is a functional reconstruction, **not a certified 1:1 emulation**. Factory waveforms, artist projects, exact DSP, hardware button combinations and physical connections are not reproduced identically.

Authored code, synthesis recipes, configurations, artwork and documentation are MIT licensed. The 39 hosted Suno and Moises recreations have separate terms: personal music-making in Baby Freakout is permitted; redistribution of the raw sample assets is not granted by this project. **No manufacturer WAVs, factory bank, artist projects, logos or copied configuration packs are distributed.** Users may download and locally import sounds/configurations subject to their own terms. See [THIRD_PARTY.md](THIRD_PARTY.md).

The operation tests do not establish sound quality or hardware parity. Real microphone/MIDI hardware, phone/tablet use, native installation and owner listening acceptance remain device checks. Web MIDI support varies by browser. Background tabs and locked/mobile devices can throttle audio and timing.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Please include a reproducible musical or control sequence, browser version and whether an issue affects live audio, exported audio or both. Do not include personal recordings without permission.

## Private sound banks

Choose **Import sound bank** in Sound desk or the **••• Studio menu** on a small screen to load a local `.riddimbank.json` file (maximum 32 MB and 128 WAV samples). The bank adds sounds to **Your samples** without changing pads; select a pad in Easy studio and choose its sound there. Reimporting identical sounds skips them, while changed sounds receive a separate ID. Undo can remove an imported batch. Back up the project to retain the sounds.

A version 1 bank is JSON with `format: "riddimting-soundbank"`, `version: 1`, an `id`, a `name`, optional `provenance` and `license`, and a `samples` array. Each sample has `id`, `name`, and embedded `data:audio/wav;base64,...`; optional `rootNote` (0–127), `bpm` (40–399), `category`, and `source` are retained as metadata. IDs use letters, numbers, underscores or hyphens. Audio is decoded locally and remains in this browser on this device unless you export or share it. Provenance and ownership information is supplied by the bank creator and is not independently verified. Root note and BPM are retained as metadata; they do not automatically set pad MIDI root, tune or loop BPM. Imported audio is not automatically licensed for redistribution: check its terms before sharing a bank, project backup or saved HTML, which can contain the audio.

### Standalone snapshots

Each saved HTML snapshot opens in its own saved workspace, separate from the hosted app and other snapshots. Sessions, sounds and Ting settings are stored together. If a stored snapshot cannot be read, autosave is disabled for that open copy to protect its existing data; export a project backup before closing. Browser storage can still be cleared, so retain portable backups.
