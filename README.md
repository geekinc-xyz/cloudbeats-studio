# 🎹 CloudBeats Studio

**CloudBeats Studio** is a professional, fully client-side virtual music creation studio & Web DAW. Built on the **Web Audio API**, it runs entirely in your browser — no downloads, no plugins, no server required. Play a **Grand Piano**, a **virtual acoustic drum kit**, and a **real recorded xylophone / glockenspiel**, then mix everything through a pro console and export your session as an **MP3**.

> Interactive Virtual Music Studio powered by Web Audio API — created by **Émile Gagnon** (GEEK FACTORY).

---

## ✨ Features

### 🎹 Grand Piano (Alexander Holm)
- High-fidelity acoustic grand piano samples (MIDI.js Soundfont, *FluidR3_GM*), streamed with a **physical resonator synthesizer fallback** for zero-latency playback
- **Sustain** pedal, octave shifting (2–6), 2-octave keyboard rendered in the UI
- **Color customizer** — 5 presets (Fire Orange, Golden Amber, Ruby Red, Neon Cyan, Purple Glow) or any custom color

### 🥁 Virtual Acoustic Drum Kit
- Full clickable drum set: **Bass Drum, Snare, Closed/Open Hi-Hat, Hi-Hat Pedal, High/Mid/Low Toms, Crash, Ride, Clap**
- Synthesized kit out of the box, or drop your own `.wav` / `.mp3` samples into `audio/drums/` to replace any drum
- Playable with number keys `1`–`9`

### 🎵 Real Recorded Xylophone
- Two sound engines:
  - 🎈 **Toy Glockenspiel** — childlike metallic bell with shimmer reverb
  - 🪵 **Concert Marimba** — warm rosewood resonance with tube resonators
- **Multi-notation system** — display bars as *Do-Ré-Mi (solfège)*, *C-D-E (letters)*, *C4-D4 (octaves)*, or *1-2-3 (numbers)*
- 5 visual finishes (Fire, Rainbow, Pastel, Mahogany Wood, Metallic Gold) + custom color
- Custom samples supported via `audio/xylophone/` (C4 → C6)

### 🎚️ Pro Mixing Console
- 5 channels: **Piano, Drums, Xylophone, Mic, Master**
- Per channel: **volume fader, pan knob, 3-band EQ (High / Mid / Low), Mute & Solo** buttons
- Live **VU meters** and a canvas **spectrum analyzer + neon oscilloscope**

### ⏱️ Metronome & Tempo
- BPM 40–240 with musical presets (Largo → Prestissimo)
- Time signatures **4/4, 3/4, 2/4, 6/8**
- Sound selection: 🪵 Wood, 🎯 Click, 🔔 Bell
- **Tap tempo**, volume control, and an LED beat indicator

### 🔁 16-Step Pattern Sequencer
- 7 tracks (Bass Drum, Snare, Hi-Hat, Piano C4/E4, Xylo G4/C5)
- Built-in patterns: **Rock & Piano**, **Groove & Xylo**, **Soft Ballad**
- Runs in sync with the metronome tempo

### 🎙️ Session Recorder
- Records **everything through the master bus** (instruments + microphone) via `MediaRecorder`
- Converts to **192 kbps MP3** in-browser with **LameJS** — export your session as `cloudbeats-session.mp3`
- Built-in playback of your last recording ("Listen")

### 🌍 Bilingual UI
- Full **English / French** interface toggle (preference persisted in `localStorage`)

---

## ⌨️ Keyboard Shortcuts

| Instrument | Keys |
|---|---|
| **Piano** (current octave) | `Q` `Z` `S` `E` `D` `F` `T` `G` `Y` `H` `U` `J` (C → B) |
| **Drums** | `1` Kick · `2` Snare · `3` Hi-Hat · `4` Open Hat · `5`/`6` Toms · `7` Crash · `8` Ride · `9` Clap |
| **Xylophone** (C4 → C6) | `U` `I` `O` `P` `J` `K` `L` `M` `V` `B` `N` `,` `;` `:` `!` |

---

## 🚀 Getting Started

No build step required — the app is plain HTML/CSS/JS.

```bash
# Clone the repo
git clone https://github.com/geekinc-xyz/cloudbeats-studio.git
cd cloudbeats-studio

# Serve locally (any static server works)
npm start
# or: npx serve -s .
```

Then open `http://localhost:3000` (or the port shown by your server). Any modern browser with Web Audio API support works — Chrome, Edge, Firefox, and Safari.

> **Tip:** click/tap anywhere on the page once to unlock the audio engine (browser autoplay policy).

### 🎚️ Vercel deployment
A `vercel.json` is included with clean URLs, CORS headers, and cache rules — just connect the repo to [Vercel](https://vercel.com) and deploy.

---

## 📁 Project Structure

```
cloudbeats-studio/
├── index.html          # Studio UI layout & markup
├── style.css           # Styling, themes & responsive layout
├── app.js              # Audio engine, mixer, instruments & sequencer logic
├── lame.min.js         # LameJS MP3 encoder
├── package.json        # Dev server scripts & metadata
├── vercel.json         # Vercel hosting configuration
└── audio/
    ├── drums/          # Drop-in folder for custom drum samples (kick.wav, snare.wav, …)
    ├── piano/          # Grand Piano samples (Alexander Holm)
    └── xylophone/      # Drop-in folder for custom xylo bars (c4.wav → c6.wav)
```

### 🎧 Using your own samples
Drop files into the folders with the exact names below, then reload — the app auto-loads them:

- **Drums** (`audio/drums/`): `kick`, `snare`, `hihat`, `openhat`, `tom1`, `tom2`, `crash`, `ride`, `clap` (`.wav` or `.mp3`)
- **Xylophone** (`audio/xylophone/`): `c4`, `d4`, `e4`, `f4`, `g4`, `a4`, `b4`, `c5` … `c6`

If no files are present, realistic synthesized/streamed sounds are used automatically.

---

## 🛠️ Tech Stack

- **Web Audio API** — audio graph, synthesis, scheduling, and recording
- **Vanilla JavaScript** — no frameworks
- **LameJS** — in-browser MP3 encoding
- **Font Awesome 6** & **Google Fonts** (Outfit, JetBrains Mono) — icons & typography
- **Vercel** — hosting

## 🙏 Credits

| Asset | Source |
|---|---|
| Grand Piano samples | [Alexander Holm — MIDI.js Soundfonts (FluidR3_GM)](https://github.com/gleitz/midi-js-soundfonts) |
| Xylophone samples | [FreePats — real acoustic samples](https://freepats.zenvoid.org) |
| Acoustic drum kit | [Tone.js audio samples](https://github.com/Tonejs/audio) |
| MP3 encoder | [LameJS](https://github.com/vladimirm/lamejs) |
| Icons & fonts | [FontAwesome](https://fontawesome.com) · [Google Fonts](https://fonts.google.com) |

## 📄 License

This project is open source under the **MIT License**. © 2026 CloudBeats Studio.

---

### ☕ Support

If you enjoy CloudBeats Studio, consider [buying Émile a coffee](https://buymeacoffee.com/emileg) 💛

Questions or feedback? → cloudbeats-studio@geek-factory.xyz
