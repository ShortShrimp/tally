# TALLY — tactical AR HUD for Quest 3

A fighter-jet-style heads-up display that runs in passthrough AR on Quest 3 — no APK, no dev account, no sideloading. It's a WebXR app: open the URL in the headset's browser, tap **ENTER HUD**, and the visor comes alive over your real room.

*Tally: fighter-pilot brevity code for "target sighted."*

## Features

- **Boot sequence** — staged cold-start with typewriter systems checks. Pinch or click to skip.
- **Flight group** — center boresight with drifting flight-path marker, world-stable pitch ladder (the horizon stays level against the real world as you tilt and pitch your head, like a real jet HUD), compass tape with heading box and target carets, SPD (head velocity), ALT (height above floor), G meter.
- **Target designation** — one action places or removes: pinch / trigger / click on empty space drops a tracked diamond at the gaze point (surface hit-test in XR); doing it again while looking at a target removes it. Targets show on the compass tape, the radar, and as an off-screen pointer arrow.
- **SCAN mode — environment contact scanner** — a sonar-style pulse sweeps outward from your position; objects it passes are acquired as numbered contacts with corner-bracket bounding boxes and a sober data tag: class, range, dimensions, assessment (LOW / WATCH / CLOSE). In the headset it ingests WebXR plane and mesh detection with semantic labels (TABLE, COUCH, WALL … from Space Setup); in sim mode the placeholder room objects feed the same pipeline. Contacts appear as hollow squares on the radar. (Live person detection isn't possible — the Quest browser never exposes camera pixels to web apps.)
- **Live sensing — sparse, ray-based** *(UNVERIFIED on hardware)* — a fan of ~15 WebXR hit-test rays is cast across your view each frame. On Quest 3/3S with Horizon Browser 40.4+, hit-test is backed by Meta's Depth API and lands on real surfaces in **unscanned** rooms, so this should need no Space Setup. Hits paint onto the radar as fading sonar traces and light up during a pulse scan. A `RNG` readout under the boresight gives live distance to whatever you're looking at. This is dozens of point samples per second — **not** a depth image or a mesh.
- **Tactical minimap** — toggleable 6 m radar with rotating sweep, range rings, live sonar returns, breadcrumb trail, target and contact blips, heading-up or north-up.
- **Pulse scan** — one-shot sonar ping from the wrist panel: a bright shockwave rolls out from you and every known surface and object flashes as a glowing box shell when the wave crosses it, holds a moment, then fades. Works in any mode.
- **Wrist panel** — look at your left palm (XR) or press P (sim): mode, pulse scan, map toggles, theme, brightness, re-zero north, clear targets/contacts, reset session, and ROOM CAPTURE, which launches Quest Space Setup from inside the HUD (needed only for semantic labels on SCAN contacts). Poke buttons with your right index finger.
- **Alerts** — MASTER CAUTION banner + klaxon on over-G and low core. CORE reads the device battery where the browser allows it.
- **Themes** — teal, amber, night-red. All audio is synthesized live (WebAudio), no assets.

## Run it

Any static HTTPS host works (WebXR requires a secure context). Locally:

```
python3 -m http.server 8377
```

- **Desktop (sim mode):** open `http://localhost:8377` — drag to look, WASD to move, click/F place-remove target, M minimap, T NAV/SCAN, P wrist panel, 1-8 panel buttons, N north-up, C theme, Q/E crouch/rise, Shift sprint.
- **Quest 3:** open the deployed HTTPS URL in the headset browser → ENTER HUD → grant passthrough, hand-tracking, and scene permissions. Run Space Setup beforehand for labeled contacts in SCAN.

## Controls (headset)

| Input | Action |
| --- | --- |
| Pinch (either hand) / trigger | Place target at gaze point, or remove the one you're looking at |
| Look at left palm | Open wrist panel |
| Poke panel button with right index | Press it |
| Left squeeze (controller) | Toggle minimap |
| Right squeeze (controller) | Cycle NAV/SCAN |

## Sensing: what is and isn't possible on Quest

The browser is a locked-down sensor environment. Straight answers:

| Capability | Status |
| --- | --- |
| Hit-test rays (live, unscanned rooms, ~5 m) | Available — Browser 40.4+, Quest 3/3S. The only live any-room sense. |
| Depth buffers (`getDepthInformation`) | **Not exposed to web pages.** Meta uses depth internally; JS never receives it. |
| Plane/mesh detection with labels (TABLE, COUCH) | Requires Space Setup. Optional — ROOM CAPTURE on the wrist panel. |
| Camera pixels / person detection | Never exposed to web apps. Not possible. |

The `SNS` line in SCAN mode reports what's actually live: `SNS HIT 14/15 · 62/S` means 14 of
15 rays are returning at 62 hits/sec. `SNS HIT-TEST UNAVAIL` means the browser refused the
hit-test sources (most likely Browser older than 40.4). In sim mode it reads
`SNS SIM FEED · NOT HW` — desktop sim is a development stand-in and proves nothing about
headset behaviour.

## Notes

- North is session-relative (WebXR exposes no magnetometer) — re-zero from the wrist panel.
- Voice commands skipped: SpeechRecognition is unsupported in the Quest browser.
- Built with Three.js as plain ES modules; no build step. `src/hud/` holds one module per HUD cluster (flight, minimap, targeting, contacts, panels, boot) plus the helmet-inertia rig that makes panels lag your head just enough to feel worn, not glued.
