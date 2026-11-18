# גיבורי הזירה (Arena Heroes)

A simple, colorful arena game for a 6-year-old Hebrew speaker. Tap a hero, tap a path, and send them to the other castle. First to knock down the other side's castle wins.

Play: https://mati-sme.github.io/arena-heroes/

## How to play

1. Open the page on a tablet or computer.
2. Tap **קל** (easy) or **קשה** (hard).
3. Tap a hero at the bottom: **אביר** (tanky melee), **קשת** (ranged), **דרקון קטן** (flying splash), **דרקון גדול** (tanky flyer), or **תותח** (slow, long-range cannon).
4. Tap a path on the field to send them. They walk and fight on their own.
5. Energy refills slowly. You need enough energy to send a hero.
6. Each castle also shoots a cannonball at the nearest enemy hero that comes close. Castles do not shoot each other.
7. A round lasts about two and a half minutes. If time runs out, the castle with more health wins.
8. On the end screen, tap **עוד פעם** to play again.

The game is fully in Hebrew, right-to-left, with large buttons and very little text. If the device has a Hebrew voice, it says short cues (the names, “well done”, “try again”). If not, it stays quiet. No ads, no accounts, no external links. Works offline after the first visit.

Art and names are original. Nothing is copied from Clash Royale.

## Run locally

Static files only — no build step.

```bash
cd /workspace/projects/arena-heroes
python3 -m http.server 8080
```

Open `http://localhost:8080`.

## Files

- `index.html` — screens (home, play, win/lose)
- `style.css` — cartoon UI, RTL, tablet-first
- `js/game.js` — simulation, drawing, input, speech, AI
- `sw.js` — offline cache (`arena-heroes-v2`)

## License

Made for Matias’s family games shelf. Hand-written; no paid APIs.
