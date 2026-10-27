# Launch posts

Replace `[link]` with your live URL before posting.

## Which file goes where

| File | Use it for |
| --- | --- |
| `easing-lab-interrupt-1080x1080.mp4` | The lead post on LinkedIn and X. Motion sells an animation tool better than any still. |
| `easing-lab-landscape-1600x900.png` | X image post, LinkedIn landscape post |
| `easing-lab-why-springs-1080x1080.png` | LinkedIn carousel or second image, X reply, Peerlist gallery |
| `easing-lab-tune-1080x1350.png` | LinkedIn portrait post (fills the most feed space), Peerlist gallery |
| `easing-lab-cover-1200x630.png` | Peerlist cover image, and the link preview card on LinkedIn and X |

## LinkedIn

I built Easing Lab, a small tool for comparing easing curves on real interface animations.

Most easing references show a curve on a graph, which tells you very little until you watch it move a real bottom sheet next to another curve. Easing Lab runs the same interaction (a sheet, dialog, toast, list, toggle or tabs) through several curves at once, on one shared clock.

The part I'm happiest with is Interrupt. Reverse an animation halfway and the graphs show why springs exist: a timing curve drops its speed and starts its curve over, so it turns a sharp corner that reads as a stutter. A spring keeps its speed and turns smoothly.

What's in it:
• 36 curves: the CSS standards, the power set, Material 3 and seven springs
• 0.5× and 0.25× playback, where short curves finally look different
• A tuning view with draggable handles and code for CSS, Motion, SwiftUI and Tailwind
• Springs use the duration and bounce model from SwiftUI and Motion, and export to CSS as linear()

Inspired by easing.dev and animations.dev.

Try it: [link]

## X

I built Easing Lab: compare easing curves on real UI, side by side.

Hit Interrupt to see why springs exist. Reversed halfway, a timing curve turns a sharp corner. A spring keeps its speed.

36 curves, 0.25× playback, code for CSS, Motion, SwiftUI.

[link]

**Reply** (with `easing-lab-why-springs-1080x1080.png`):

Same moment, three curves. The timing curve throws away its speed and restarts its curve, so its velocity jumps. The springs carry their velocity into the new direction. That jump is the stutter you feel when a CSS transition gets interrupted.

## Peerlist

**Name:** Easing Lab

**Tagline:** Compare easing curves and springs on real UI

**Description:**
Easing Lab runs the same interface animation through several easing curves at once, so you see the difference instead of reading a graph. Pick a sheet, dialog, toast, list, toggle or tabs, slow it to 0.25×, or hit Interrupt to see why springs exist: reversed halfway, a timing curve turns a sharp corner while a spring keeps its speed. Tune any curve with draggable handles and copy it as CSS, Motion, SwiftUI or Tailwind.

**Built with:** HTML, CSS, JavaScript. No framework and no dependencies.

**Category:** Design tools, Developer tools
