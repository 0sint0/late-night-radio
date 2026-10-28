# Late Night Radio

A browser radio where you turn a dial through static until stations fade in. Some of them are playing music. Some are broadcasting Morse code. One doesn't appear until you've found the others. There's a small story behind it.

Live: https://0sint0.github.io/late-night-radio/

---

To run it locally, just open `index.html` in a browser. No server needed. The web fonts won't load on `file://` but the fallbacks are fine.

You'll need to click "Power on" before any sound starts. That's not laziness, it's how browsers handle audio: they won't create a sound context until you gesture first.

Turn the knob by dragging up and down, or use the arrow keys when it's focused. When a station locks, you'll hear it (and see a lamp light up). Morse stations show a decoder panel; you can try to type what you hear, or just hit Reveal if you'd rather skip that part. The ending takes a while to unlock but it's there.

Progress is saved in your browser's localStorage (not a server, just your local machine). It resets if you clear site data, use private mode, or hit "Erase and start over" in the Logbook. Each browser and device saves separately, so don't expect it to sync anywhere.

Sound settings (volume, static level, Morse speed) are in the Settings dialog and save separately from progress, so resetting the game doesn't touch them.

If you turn the sound off completely, the visual Morse strip and the logbook captions still work. It's quieter but playable.

I've tested this mostly in Chrome. Firefox works. Safari on iOS is a bit hit-or-miss with the AudioContext resuming after the tab goes to the background, but it usually recovers.

---

If you want to add a station: `js/stations.js` has the data (frequency, type, name, content), and `js/story.js` has the captions and clues. Adding one object to each is roughly all it takes, though you'd also bump the gate thresholds in `main.js` if you want the new station to count toward unlocking the ending.

Built with the help of an AI coding assistant (Cline / Claude).

MIT License.
