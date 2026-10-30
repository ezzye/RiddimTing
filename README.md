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
- 46 recreated synthesis presets, keys/scales, repeat/arpeggio, sample import/capture, chop, stretch and resampling.
- Seven send effects, twelve reconstructed punch controls, automation, loop performance, sidechain and output compression.
- Ting voice processing, four sample slots, and editable/importable JSON effect chains.
- Local project backup, WAV rendering, performance recording, and a portable HTML instrument.

Your sessions and recordings stay in browser storage unless you download or share them. The app has no account, analytics, upload service or project backend. Static hosting providers can keep normal access logs. **Save project** and **Save HTML** include all nine sessions and imported samples; check the contents and sound licences before sharing.

## Source and builds

`app/` contains the buildless Web Audio instrument. `site/` contains the Baby Freakout page and HTML guide. `scripts/build.mjs` produces `dist/`, versions the offline cache, and creates `dist/downloads/RiddimTing.html` with a clean demo snapshot. Build output is ignored by Git. `.openai/hosting.json` identifies the static hosting project; it contains no credentials.

CI runs deterministic operation tests and public-release checks, then builds a downloadable website artifact. Hosting publication is performed through Sites' source/version deployment workflow; GitHub CI alone does not publish a new hosted version.

## Fidelity and licences

This independent project is inspired by the EP–40 and Ting workflow. It is not affiliated with or endorsed by Teenage Engineering. Hardware names are used only to identify the reference devices. It is a functional reconstruction, **not a certified 1:1 emulation**. Factory waveforms, artist projects, exact DSP, hardware button combinations and physical connections are not reproduced identically.

Authored code, synthesis recipes, configurations, artwork and documentation are MIT licensed. **No manufacturer WAVs, factory bank, artist projects, logos or copied configuration packs are distributed.** Users may download and locally import sounds/configurations subject to their own terms. See [THIRD_PARTY.md](THIRD_PARTY.md).

The operation tests do not establish sound quality or hardware parity. Real microphone/MIDI hardware, phone/tablet use, native installation and owner listening acceptance remain device checks. Web MIDI support varies by browser. Background tabs and locked/mobile devices can throttle audio and timing.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Please include a reproducible musical or control sequence, browser version and whether an issue affects live audio, exported audio or both. Do not include personal recordings without permission.
