# TALLY — tactical AR HUD for Quest 3

A fighter-jet-style heads-up display that runs in passthrough AR on Quest 3 — no APK, no dev account, no sideloading. It's a WebXR app: open the URL in the headset's browser, tap **ENTER HUD**, and the visor comes alive over your real room.

*Tally: fighter-pilot brevity code for "target sighted."*

## Features

- **Boot sequence** — staged cold-start with typewriter systems checks ("WEAPONS … FENCE IN"). Pinch or click to skip.
- **Flight group** — center boresight with drifting flight-path marker, pitch ladder that rolls with your head, compass tape with heading box and target carets, SPD (head velocity), ALT (height above floor), G meter.
- **Targeting (COMBAT mode)** — a practice drone spawns and drifts around the room; hold your gaze on it to seek and lock (brackets converge, lock tone). Designate real-world points as tracked targets. Fire the repulsor: pinch (hands) / trigger (controller) / click (sim). Kills are counted; the core drains per shot.
- **Tactical minimap** — toggleable radar with rotating sweep, 4 m range rings, breadcrumb trail of your movement, target blips that flare under the sweep, heading-up or north-up.
- **Wrist panel** — look at your left palm (XR) or press P (sim): mode select, map toggles, theme, brightness, re-zero north, clear targets, reset session. Poke buttons with your right index finger.
- **Alerts** — MASTER CAUTION banner + klaxon on over-G, low core, critical core.
- **SCAN mode** — sonar-style pulse rings sweep the floor outward from your position.
- **Themes** — teal, amber, night-red. All audio is synthesized live (WebAudio), no assets.

## Run it

Any static HTTPS host works (WebXR requires a secure context). Locally:

```
python3 -m http.server 8377
```

- **Desktop (sim mode):** open `http://localhost:8377` — drag to look, WASD to move, click to fire, F designate, M minimap, T mode, P wrist panel, 1-8 panel buttons, N north-up, C theme, Q/E crouch/rise, Shift sprint.
- **Quest 3:** open the deployed HTTPS URL in the headset browser → ENTER HUD → grant passthrough + hand-tracking permissions.

## Controls (headset)

| Input | Action |
| --- | --- |
| Right pinch / right trigger | Fire repulsor |
| Left pinch / left trigger | Designate target at gaze point (hit-test) |
| Look at left palm | Open wrist panel |
| Poke panel button with right index | Press it |
| Left squeeze (controller) | Toggle minimap |
| Right squeeze (controller) | Cycle mode |

## Notes

- North is session-relative (WebXR exposes no magnetometer) — re-zero from the wrist panel.
- Built with Three.js as plain ES modules; no build step. `src/hud/` holds one module per HUD cluster (flight, minimap, targeting, panels, boot) plus the helmet-inertia rig that makes panels lag your head just enough to feel worn, not glued.
