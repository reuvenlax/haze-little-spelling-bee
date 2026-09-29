# 🐝 Haze's Little Spelling Bee

A cheerful, kid-friendly Spelling Bee web game designed for a 6-year-old!

## ✨ Features
- **3-Letter Words Allowed**: Spell familiar 3-letter, 4-letter, and longer words (`CAT`, `DOG`, `SUN`, `STAR`, `BEAR`, `TREE`, `CAKE`, etc.).
- **Emoji Picture Hints 💡**: Tap **Hint** to see a picture clue (like 🐱 *"A furry pet that says meow"*) and the first letter of an unfound word. Tap **Hint** again to reveal another letter!
- **Read-Aloud Voice 🔊**: Uses the browser's speech synthesis to read found words, cheers, and picture clues out loud. Tap any found word in the honey jar to hear it again!
- **Cute Bee Ranks & Confetti 👑**: Earn stars ⭐ for every letter and level up from **Little Sprout 🌱** to **Daisy Explorer 🌼**, **Busy Bee 🐝**, **Honey Maker 🍯**, **Flower Friend 🌸**, and **Queen Bee 👑**!
- **12 Themed Honeycomb Puzzles**: Switch puzzles anytime via the puzzle selector at the top.

## 🚀 Running Locally

Because the game uses pure HTML5 Canvas, CSS, and Vanilla JavaScript (zero build step!), you can open `index.html` directly in any browser or run a quick local server:

```bash
python3 -m http.server 8000
```

Then visit `http://localhost:8000` in your browser.

## 🎨 Customizing Words or Puzzles

All puzzles and picture clues live in [`words.js`](./words.js):
- Add new words with emojis and clues to `KID_WORDS`.
- Add new 7-letter honeycombs to `PUZZLES`.
