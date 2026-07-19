# TALLY — tactical AR HUD for Quest 3

A fighter-jet-style heads-up display that runs in passthrough AR on Quest 3 — no APK, no dev account, no sideloading. It's a WebXR app: open the URL in the headset's browser, tap **ENTER HUD**, and the visor comes alive over your real room.

*Tally: fighter-pilot brevity code for "target sighted."*

## Features

- **Boot sequence** — staged cold-start with typewriter systems checks. Pinch or click to skip.
- **Flight group** — center boresight with drifting flight-path marker, world-stable pitch ladder (the horizon stays level against the real world as you tilt and pitch your head, like a real jet HUD), compass tape with heading box and target carets, SPD (head velocity), ALT (height above floor), G meter.
- **Target designation** — one action places or removes: pinch / trigger / click on empty space drops a tracked diamond at the gaze point (surface hit-test in XR); doing it again while looking at a target removes it. Targets show on the compass tape, the radar, and as an off-screen pointer arrow.
- **SCAN mode — environment contact scanner** — a sonar-style pulse sweeps outward from your position; objects it passes are acquired as numbered contacts with corner-bracket bounding boxes and a sober data tag: class, range, dimensions, assessment (LOW / WATCH / CLOSE). In the headset it ingests WebXR plane and mesh detection with semantic labels (TABLE, COUCH, WALL … from Space Setup); in sim mode the placeholder room objects feed the same pipeline. Contacts appear as hollow squares on the radar. (Live person detection isn't possible — the Quest browser never exposes camera pixels to web apps.)
- **Tactical minimap** — toggleable radar with rotating sweep, range rings, breadcrumb trail, target and contact blips, heading-up or north-up.
- **Wrist panel** — look at your left palm (XR) or press P (sim): mode, map toggles, theme, brightness, re-zero north, clear targets/contacts, reset session. Poke buttons with your right index finger.
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

## Notes

- North is session-relative (WebXR exposes no magnetometer) — re-zero from the wrist panel.
- Voice commands skipped: SpeechRecognition is unsupported in the Quest browser.
- Built with Three.js as plain ES modules; no build step. `src/hud/` holds one module per HUD cluster (flight, minimap, targeting, contacts, panels, boot) plus the helmet-inertia rig that makes panels lag your head just enough to feel worn, not glued.
