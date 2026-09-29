---
name: lagos-brand
description: LAGOS visual branding for internal apps, dashboards and mockups (Power Apps code apps, Rayfin/Fabric apps, HTML prototypes). Use whenever building or styling UI in this repo, or when asked to make something "look like LAGOS" / "on brand".
---

# LAGOS brand for internal apps

Derived from the live styles on lagos.com (Sept 2026). This is for **internal tools**
(dashboards, apps, mockups), not customer-facing marketing. Don't copy the logo file;
render the wordmark as text.

## Feel
Quiet luxury. Mostly black on white / warm off-white, generous whitespace, thin hairlines,
square-ish corners (2px), uppercase labels with wide letter-spacing. Colour is used sparingly:
plum for brand moments, gold as a warm accent (sterling silver + 18K gold is the house look).

## Tokens

| Role | Light | Dark |
|---|---|---|
| Page background | `#f9f8f7` (warm off-white) | `#121011` |
| Card surface | `#ffffff` | `#1c1a1b` |
| Subtle surface | `#f4f2f0` | `#252224` |
| Primary text | `#000000` | `#ffffff` |
| Secondary text | `#4a4748` | `#cfc9cc` |
| Muted text | `#7d7a7b` | `#928c8f` |
| Hairline | `#e6e2df` | `#2f2b2d` |
| Brand (plum) | `#4b3048` | `#6d4868` |
| Brand wash | `#f3eef2` | `#2a2029` |
| Gold accent | `#b07a12` | `#d9a441` |

## Type
- **Montserrat** everywhere (Google Fonts, weights 400/500/600/700). Body 13–14px, weight 500, letter-spacing ~0.2–0.5px.
- Labels, nav, buttons, card titles: UPPERCASE, 10–13px, letter-spacing 1–2px, weight 500–600.
- Wordmark: "LAGOS", weight 400, letter-spacing ~0.4em.
- Big numbers: Montserrat 500, proportional figures; `tabular-nums` only in table columns and axis ticks.

## Components
- Top promo strip: plum background, white uppercase 11px text, letter-spacing 2px.
- Primary button: plum fill, white uppercase text. Secondary: 1px hairline border, uppercase.
- Tabs: uppercase, active tab = black text + 2px black underline.
- Cards: white surface, 1px hairline, 2px radius, very soft shadow (none in dark mode).

## Chart colours (validated with the dataviz skill's validator, all-pairs, both modes)

| Slot | Light | Dark | Use |
|---|---|---|---|
| 1 plum | `#8b3d80` | `#c46fb6` | primary series / Wholesale |
| 2 gold | `#b07a12` | `#b8841a` | second series / Direct (B2C) / returns |
| 3 blue | `#1a7fb8` | `#1f6fb0` | third series / comparison (e.g. last year) |

Max three categorical series; fold the rest into "Other". Status colours (good `#0ca30c`,
warning `#fab219`, critical `#d03b3b`) are only for state and always ship with an icon + label.

Reference implementation: `mockups/customer-360.html`.
