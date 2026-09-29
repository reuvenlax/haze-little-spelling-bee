// Haze's Little Spelling Bee - Main Game Engine (HTML5 Canvas + Web Speech + Web Audio)

const RANKS = [
  { name: "Little Sprout", emoji: "🌱", minStars: 0 },
  { name: "Daisy Explorer", emoji: "🌼", minStars: 6 },
  { name: "Busy Bee", emoji: "🐝", minStars: 14 },
  { name: "Honey Maker", emoji: "🍯", minStars: 22 },
  { name: "Flower Friend", emoji: "🌸", minStars: 30 },
  { name: "Queen Bee!", emoji: "👑", minStars: 40 }
];

const STORAGE_KEY = "haze_little_spelling_bee_v1";

class SpellingBeeGame {
  constructor() {
    this.puzzleIndex = 0;
    this.outerLetters = [];
    this.currentWord = "";
    this.foundWords = []; // array of uppercase words
    this.stars = 0;
    this.rankIndex = 0;
    this.queenCelebrated = false;
    this.voiceEnabled = true;

    // Hint state
    this.activeHintWord = null;
    this.hintRevealCount = 1;

    // Honeycomb Canvas state
    this.hcCanvas = document.getElementById("honeycomb-canvas");
    this.hcCtx = this.hcCanvas.getContext("2d");
    this.hexCells = []; // [{ letter, isCenter, x, y, r, scale, targetScale, pressTime }]
    this.hoveredCell = -1;

    // FX Confetti Canvas state
    this.fxCanvas = document.getElementById("fx-canvas");
    this.fxCtx = this.fxCanvas.getContext("2d");
    this.particles = [];

    // Audio context (lazy initialized on first interaction)
    this.audioCtx = null;

    this.loadSavedState();
    this.initPuzzle(this.puzzleIndex, false);
    this.bindEvents();
    this.resizeCanvases();
    requestAnimationFrame(() => this.animate());
  }

  // --- Persistence ---
  loadSavedState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw);
      if (typeof saved.puzzleIndex === "number" && PUZZLES[saved.puzzleIndex]) {
        this.puzzleIndex = saved.puzzleIndex;
      }
      if (typeof saved.voiceEnabled === "boolean") {
        this.voiceEnabled = saved.voiceEnabled;
      }
      this.allProgress = saved.progress || {};
    } catch (e) {
      this.allProgress = {};
    }
  }

  saveState() {
    try {
      const puzzle = PUZZLES[this.puzzleIndex];
      if (!this.allProgress) this.allProgress = {};
      this.allProgress[puzzle.id] = {
        foundWords: this.foundWords,
        stars: this.stars,
        queenCelebrated: this.queenCelebrated
      };
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          puzzleIndex: this.puzzleIndex,
          voiceEnabled: this.voiceEnabled,
          progress: this.allProgress
        })
      );
    } catch (e) {
      // Ignore storage errors in private browsing
    }
  }

  // --- Puzzle Setup & Word Lists ---
  initPuzzle(index, resetProgress = false) {
    this.puzzleIndex = index;
    const puzzle = PUZZLES[index];
    this.centerLetter = puzzle.center.toUpperCase();
    this.outerLetters = [...puzzle.outer.map(l => l.toUpperCase())];
    this.allowedSet = new Set([this.centerLetter, ...this.outerLetters]);

    // Compute all valid picture words (from KID_WORDS) for this puzzle
    this.puzzleKidWords = Object.keys(KID_WORDS)
      .filter(w => w.length >= 3 && w.includes(this.centerLetter) && [...w].every(ch => this.allowedSet.has(ch)))
      .sort((a, b) => a.length - b.length || a.localeCompare(b));

    // Restore or reset progress
    const savedForPuzzle = (!resetProgress && this.allProgress && this.allProgress[puzzle.id]) || null;
    this.foundWords = savedForPuzzle ? [...savedForPuzzle.foundWords] : [];
    this.stars = savedForPuzzle ? savedForPuzzle.stars : 0;
    this.queenCelebrated = savedForPuzzle ? !!savedForPuzzle.queenCelebrated : false;

    this.currentWord = "";
    this.closeHint();
    this.layoutHoneycomb();
    this.updateRank(false);
    this.renderUI();
    this.saveState();
  }

  // --- Honeycomb Geometry & Drawing ---
  layoutHoneycomb() {
    const w = 380;
    const h = 340;
    const cx = w / 2;
    const cy = h / 2;
    const hexRadius = 48;
    // Distance between hexagon centers for flat-topped or pointy-topped hexes
    const dist = hexRadius * 1.82;

    // 6 surrounding angles (30, 90, 150, 210, 270, 330 degrees)
    const angles = [-90, -30, 30, 90, 150, 210].map(a => (a * Math.PI) / 180);

    this.hexCells = [
      {
        letter: this.centerLetter,
        isCenter: true,
        x: cx,
        y: cy,
        r: hexRadius,
        scale: 1,
        pressAnim: 0
      }
    ];

    for (let i = 0; i < 6; i++) {
      this.hexCells.push({
        letter: this.outerLetters[i],
        isCenter: false,
        x: cx + Math.cos(angles[i]) * dist,
        y: cy + Math.sin(angles[i]) * dist,
        r: hexRadius,
        scale: 1,
        pressAnim: 0
      });
    }
  }

  resizeCanvases() {
    const dpr = window.devicePixelRatio || 1;
    // Honeycomb canvas (logical 380x340)
    this.hcCanvas.width = 380 * dpr;
    this.hcCanvas.height = 340 * dpr;
    this.hcCtx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // FX canvas (full window)
    this.fxCanvas.width = window.innerWidth * dpr;
    this.fxCanvas.height = window.innerHeight * dpr;
    this.fxCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  drawHexPath(ctx, x, y, r) {
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const angle = (Math.PI / 3) * i;
      const hx = x + r * Math.cos(angle);
      const hy = y + r * Math.sin(angle);
      if (i === 0) ctx.moveTo(hx, hy);
      else ctx.lineTo(hx, hy);
    }
    ctx.closePath();
  }

  drawHoneycomb() {
    const ctx = this.hcCtx;
    ctx.clearRect(0, 0, 380, 340);

    for (let i = 0; i < this.hexCells.length; i++) {
      const cell = this.hexCells[i];
      // Spring scale animation
      if (cell.pressAnim > 0) {
        cell.pressAnim = Math.max(0, cell.pressAnim - 0.08);
      }
      const bounce = 1 - 0.14 * Math.sin(cell.pressAnim * Math.PI);
      const hoverBoost = this.hoveredCell === i ? 1.04 : 1.0;
      const scale = bounce * hoverBoost;

      ctx.save();
      ctx.translate(cell.x, cell.y);
      ctx.scale(scale, scale);

      // 3D bottom shadow hex
      this.drawHexPath(ctx, 0, 5, cell.r);
      ctx.fillStyle = cell.isCenter ? "#b45309" : "#d97706";
      ctx.fill();

      // Main hex body
      this.drawHexPath(ctx, 0, 0, cell.r);
      const grad = ctx.createLinearGradient(0, -cell.r, 0, cell.r);
      if (cell.isCenter) {
        grad.addColorStop(0, "#fde047");
        grad.addColorStop(1, "#f59e0b");
      } else {
        grad.addColorStop(0, "#fffdf0");
        grad.addColorStop(1, "#fef08a");
      }
      ctx.fillStyle = grad;
      ctx.fill();

      ctx.lineWidth = 3;
      ctx.strokeStyle = cell.isCenter ? "#b45309" : "#f59e0b";
      ctx.stroke();

      // Inner top highlight
      this.drawHexPath(ctx, 0, 0, cell.r - 5);
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = "rgba(255, 255, 255, 0.65)";
      ctx.stroke();

      // Letter text
      ctx.fillStyle = cell.isCenter ? "#451a03" : "#5c2d0c";
      ctx.font = "900 32px 'Comic Sans MS', 'Chalkboard SE', 'Nunito', sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(cell.letter, 0, 2);

      // Small star badge on center hex
      if (cell.isCenter) {
        ctx.font = "14px sans-serif";
        ctx.fillText("⭐", 0, -28);
      }

      ctx.restore();
    }
  }

  // --- FX Confetti & Particles ---
  spawnBurst(x, y, count = 28, bigCelebration = false) {
    const colors = ["#facc15", "#f97316", "#ec4899", "#22c55e", "#38bdf8", "#a855f7"];
    const emojis = ["⭐", "🐝", "🍯", "🌸", "✨"];
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = (bigCelebration ? 4 : 2) + Math.random() * (bigCelebration ? 9 : 5);
      const isEmoji = bigCelebration && i % 5 === 0;
      this.particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - (bigCelebration ? 4 : 2),
        gravity: 0.18,
        size: 7 + Math.random() * 6,
        color: colors[i % colors.length],
        emoji: isEmoji ? emojis[i % emojis.length] : null,
        rotation: Math.random() * Math.PI * 2,
        vRot: (Math.random() - 0.5) * 0.2,
        alpha: 1
      });
    }
  }

  drawFX() {
    const ctx = this.fxCtx;
    ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);

    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.x += p.vx;
      p.y += p.vy;
      p.vy += p.gravity;
      p.rotation += p.vRot;
      p.alpha -= 0.014;

      if (p.alpha <= 0) {
        this.particles.splice(i, 1);
        continue;
      }

      ctx.save();
      ctx.globalAlpha = Math.max(0, p.alpha);
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rotation);

      if (p.emoji) {
        ctx.font = "22px sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(p.emoji, 0, 0);
      } else {
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.65);
      }
      ctx.restore();
    }
  }

  animate() {
    this.drawHoneycomb();
    this.drawFX();
    requestAnimationFrame(() => this.animate());
  }

  // --- Sound Effects (Web Audio API) & Voice (Web Speech API) ---
  ensureAudio() {
    if (!this.audioCtx) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (AudioContextClass) {
        this.audioCtx = new AudioContextClass();
      }
    }
    if (this.audioCtx && this.audioCtx.state === "suspended") {
      this.audioCtx.resume();
    }
  }

  playTone(freq = 520, duration = 0.09, type = "sine", delay = 0) {
    try {
      this.ensureAudio();
      if (!this.audioCtx) return;
      const now = this.audioCtx.currentTime + delay;
      const osc = this.audioCtx.createOscillator();
      const gain = this.audioCtx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, now);
      gain.gain.setValueAtTime(0.14, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
      osc.connect(gain);
      gain.connect(this.audioCtx.destination);
      osc.start(now);
      osc.stop(now + duration);
    } catch (e) {
      // Ignore audio errors
    }
  }

  playSuccessChime(isRankUp = false) {
    const notes = isRankUp ? [523.25, 659.25, 783.99, 1046.5] : [523.25, 659.25, 783.99];
    notes.forEach((n, idx) => {
      this.playTone(n, 0.16, "triangle", idx * 0.09);
    });
  }

  playGentleOops() {
    this.playTone(260, 0.12, "sine", 0);
    this.playTone(220, 0.15, "sine", 0.1);
  }

  speak(text) {
    if (!this.voiceEnabled || !("speechSynthesis" in window)) return;
    try {
      window.speechSynthesis.cancel();
      const utter = new SpeechSynthesisUtterance(text);
      utter.rate = 0.92; // Slightly slower and clearer for a 6-year-old
      utter.pitch = 1.12; // Cheerful friendly pitch
      window.speechSynthesis.speak(utter);
    } catch (e) {
      // Ignore speech synthesis errors
    }
  }

  // --- Gameplay Actions ---
  tapLetter(letter, cellIndex = -1) {
    if (this.currentWord.length >= 12) return;
    this.currentWord += letter;

    if (cellIndex >= 0 && this.hexCells[cellIndex]) {
      this.hexCells[cellIndex].pressAnim = 1;
    } else {
      const idx = this.hexCells.findIndex(c => c.letter === letter);
      if (idx >= 0) this.hexCells[idx].pressAnim = 1;
    }

    this.playTone(440 + this.currentWord.length * 35, 0.08, "sine");
    this.renderWordTiles();
  }

  deleteLetter() {
    if (!this.currentWord.length) return;
    this.currentWord = this.currentWord.slice(0, -1);
    this.playTone(330, 0.07, "sine");
    this.renderWordTiles();
  }

  clearWord() {
    this.currentWord = "";
    this.renderWordTiles();
  }

  shuffleOuterLetters() {
    for (let i = this.outerLetters.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [this.outerLetters[i], this.outerLetters[j]] = [this.outerLetters[j], this.outerLetters[i]];
    }
    for (let i = 0; i < 6; i++) {
      this.hexCells[i + 1].letter = this.outerLetters[i];
      this.hexCells[i + 1].pressAnim = 1;
    }
    this.playTone(480, 0.07, "triangle", 0);
    this.playTone(600, 0.09, "triangle", 0.06);
  }

  submitWord() {
    const word = this.currentWord.toUpperCase().trim();
    if (!word) {
      this.showToast("Tap the honeycomb letters first! 🐝", "oops");
      return;
    }

    if (word.length < 3) {
      this.playGentleOops();
      this.showToast("Words need at least 3 letters! ✨", "oops");
      return;
    }

    if (![...word].every(ch => this.allowedSet.has(ch))) {
      this.playGentleOops();
      this.showToast("Use only the letters in the honeycomb!", "oops");
      this.clearWord();
      return;
    }

    if (!word.includes(this.centerLetter)) {
      this.playGentleOops();
      this.showToast(`Every word must use the golden "${this.centerLetter}"! ⭐`, "oops");
      this.clearWord();
      return;
    }

    if (this.foundWords.includes(word)) {
      this.playGentleOops();
      const info = KID_WORDS[word];
      this.showToast(`You already found ${info ? info.emoji + " " : ""}${word}!`, "oops");
      this.speak(`You already found ${word.toLowerCase()}!`);
      this.clearWord();
      return;
    }

    const isKidWord = Boolean(KID_WORDS[word]);
    const isExtraWord = EXTRA_VALID_WORDS.has(word);

    if (!isKidWord && !isExtraWord) {
      this.playGentleOops();
      this.showToast(`Hmm, let's try a different word! 💡`, "oops");
      this.clearWord();
      return;
    }

    // Valid word found!
    this.foundWords.unshift(word);
    const usedAll7 = new Set([...word]).size === 7;
    const earnedStars = word.length + (usedAll7 ? 5 : 0);
    this.stars += earnedStars;

    // Close hint if she just solved the hinted word
    if (this.activeHintWord === word) {
      this.closeHint();
    }

    this.clearWord();

    const kidInfo = KID_WORDS[word];
    const emoji = kidInfo ? kidInfo.emoji : "🌟";
    const praiseList = ["Awesome!", "Great job!", "Super spelling!", "Sweet honey!", "Yay!", "Brilliant!"];
    const praise = praiseList[Math.floor(Math.random() * praiseList.length)];

    if (usedAll7) {
      this.showToast(`🌈 SUPER BEE! ${emoji} ${word} (+${earnedStars} ⭐)`, "success");
    } else {
      this.showToast(`${emoji} ${praise} ${word}! (+${earnedStars} ⭐)`, "success");
    }

    // Confetti burst around the honeycomb
    const rect = this.hcCanvas.getBoundingClientRect();
    this.spawnBurst(rect.left + rect.width / 2, rect.top + rect.height / 2, usedAll7 ? 55 : 28, usedAll7);

    const rankedUp = this.updateRank(true);
    if (!rankedUp) {
      this.playSuccessChime(false);
    }

    // Speak the word out loud!
    if (kidInfo) {
      this.speak(`${praise} ${word.toLowerCase()}!`);
    } else {
      this.speak(`${praise} ${word.toLowerCase()}!`);
    }

    this.renderUI();
    this.saveState();
  }

  // --- Progressive Emoji Hint System ---
  showHint() {
    const unfoundKidWords = this.puzzleKidWords.filter(w => !this.foundWords.includes(w));
    if (unfoundKidWords.length === 0) {
      this.showToast("🌟 Wow! You found all the picture words in this puzzle!", "success");
      this.speak("Wow! You found all the picture words in this puzzle!");
      return;
    }

    // If a hint is already open and still unfound, reveal one more letter!
    if (this.activeHintWord && !this.foundWords.includes(this.activeHintWord)) {
      if (this.hintRevealCount < this.activeHintWord.length - 1) {
        this.hintRevealCount++;
      } else {
        // Pick a different unfound word if we already revealed almost all letters
        const others = unfoundKidWords.filter(w => w !== this.activeHintWord);
        if (others.length > 0) {
          this.activeHintWord = others[0];
          this.hintRevealCount = 1;
        }
      }
    } else {
      // Pick the shortest/simplest unfound picture word first!
      this.activeHintWord = unfoundKidWords[0];
      this.hintRevealCount = 1;
    }

    this.renderHintCard();
    const info = KID_WORDS[this.activeHintWord];
    this.playTone(660, 0.1, "triangle");
    this.speak(`Hint: ${info.clue}. Starts with ${this.activeHintWord[0]}.`);
  }

  renderHintCard() {
    const card = document.getElementById("hint-card");
    if (!this.activeHintWord) {
      card.classList.add("hidden");
      return;
    }
    const info = KID_WORDS[this.activeHintWord];
    card.classList.remove("hidden");
    document.getElementById("hint-emoji").textContent = info.emoji;
    document.getElementById("hint-clue").textContent = info.clue;

    const slotsEl = document.getElementById("hint-slots");
    slotsEl.innerHTML = "";
    for (let i = 0; i < this.activeHintWord.length; i++) {
      const ch = this.activeHintWord[i];
      const slot = document.createElement("span");
      slot.className = "hint-slot" + (ch === this.centerLetter ? " center-slot" : "");
      slot.textContent = i < this.hintRevealCount ? ch : "_";
      slotsEl.appendChild(slot);
    }
  }

  closeHint() {
    this.activeHintWord = null;
    this.hintRevealCount = 1;
    const card = document.getElementById("hint-card");
    if (card) card.classList.add("hidden");
  }

  // --- Rank & UI Rendering ---
  updateRank(celebrate = false) {
    let newRankIdx = 0;
    for (let i = 0; i < RANKS.length; i++) {
      if (this.stars >= RANKS[i].minStars) {
        newRankIdx = i;
      }
    }
    const rankedUp = celebrate && newRankIdx > this.rankIndex;
    this.rankIndex = newRankIdx;

    if (rankedUp) {
      this.playSuccessChime(true);
      this.spawnBurst(window.innerWidth / 2, window.innerHeight / 3, 60, true);
      const r = RANKS[this.rankIndex];
      this.showToast(`🎉 Rank Up! You are now a ${r.emoji} ${r.name}!`, "success");

      if (this.rankIndex === RANKS.length - 1 && !this.queenCelebrated) {
        this.queenCelebrated = true;
        setTimeout(() => {
          document.getElementById("queen-modal").classList.remove("hidden");
          this.speak("Hooray! You reached Queen Bee! Amazing spelling, Haze!");
        }, 500);
      }
    }
    return rankedUp;
  }

  showToast(msg, type = "normal") {
    const el = document.getElementById("toast-message");
    el.textContent = msg;
    el.className = "toast-message" + (type !== "normal" ? ` ${type}` : "");
  }

  renderWordTiles() {
    const container = document.getElementById("word-tiles");
    const clearBtn = document.getElementById("clear-word-btn");
    container.innerHTML = "";

    if (!this.currentWord) {
      const span = document.createElement("span");
      span.className = "word-placeholder";
      span.textContent = "Tap letters below...";
      container.appendChild(span);
      clearBtn.classList.add("hidden");
      return;
    }

    clearBtn.classList.remove("hidden");
    for (const ch of this.currentWord) {
      const tile = document.createElement("span");
      tile.className = "letter-tile" + (ch === this.centerLetter ? " center-letter" : "");
      tile.textContent = ch;
      container.appendChild(tile);
    }
  }

  renderUI() {
    const puzzle = PUZZLES[this.puzzleIndex];
    document.getElementById("current-puzzle-title").textContent = puzzle.title;

    // Voice toggle button
    const voiceBtn = document.getElementById("voice-toggle-btn");
    voiceBtn.textContent = this.voiceEnabled ? "🔊 Voice: ON" : "🔇 Voice: OFF";
    voiceBtn.classList.toggle("active", this.voiceEnabled);

    // Rank & Stars
    const rank = RANKS[this.rankIndex];
    document.getElementById("rank-emoji").textContent = rank.emoji;
    document.getElementById("rank-name").textContent = rank.name;
    document.getElementById("star-count").textContent = this.stars;
    document.getElementById("word-count").textContent = this.foundWords.length;
    document.getElementById("found-count-header").textContent = this.foundWords.length;

    const maxStars = RANKS[RANKS.length - 1].minStars;
    const pct = Math.min(100, Math.round((this.stars / maxStars) * 100));
    document.getElementById("rank-fill").style.width = `${pct}%`;

    // Milestones
    const msContainer = document.getElementById("rank-milestones");
    msContainer.innerHTML = "";
    RANKS.forEach((r, idx) => {
      const dot = document.createElement("div");
      dot.className = "milestone-dot" + (this.stars >= r.minStars ? " reached" : "");
      dot.innerHTML = `<span class="m-icon">${r.emoji}</span><span>${r.minStars}⭐</span>`;
      msContainer.appendChild(dot);
    });

    const nextRankHint = document.getElementById("next-rank-hint");
    if (this.rankIndex < RANKS.length - 1) {
      const nextR = RANKS[this.rankIndex + 1];
      const needed = nextR.minStars - this.stars;
      nextRankHint.textContent = `${needed} more ⭐ to become ${nextR.emoji} ${nextR.name}!`;
    } else {
      nextRankHint.textContent = `👑 You are the Queen Bee! Keep finding bonus words!`;
    }

    this.renderWordTiles();

    // Found words list
    const listEl = document.getElementById("found-words-list");
    listEl.innerHTML = "";
    if (this.foundWords.length === 0) {
      listEl.innerHTML = `
        <div class="empty-words-state">
          <div class="empty-bee">🐝</div>
          <p>Your honey jar is waiting for words!</p>
          <p class="empty-sub">Need an idea? Tap the <strong>💡 Hint</strong> button!</p>
        </div>
      `;
    } else {
      this.foundWords.forEach(w => {
        const info = KID_WORDS[w];
        const emoji = info ? info.emoji : "🌟";
        const chip = document.createElement("button");
        chip.type = "button";
        chip.className = "found-word-chip";
        chip.innerHTML = `
          <span class="chip-emoji">${emoji}</span>
          <span>${w}</span>
          <span class="chip-stars">+${w.length}⭐</span>
        `;
        chip.addEventListener("click", () => {
          const clueText = info ? `. ${info.clue}` : "";
          this.speak(`${w.toLowerCase()}${clueText}`);
          this.showToast(`${emoji} ${w}${info ? " — " + info.clue : ""}`);
        });
        listEl.appendChild(chip);
      });
    }

    // Picture words counter
    const foundPictureCount = this.foundWords.filter(w => Boolean(KID_WORDS[w])).length;
    document.getElementById("picture-words-progress").textContent =
      `Picture Words: ${foundPictureCount} / ${this.puzzleKidWords.length}`;
  }

  renderPuzzleModal() {
    const grid = document.getElementById("puzzle-grid");
    grid.innerHTML = "";
    PUZZLES.forEach((p, idx) => {
      const saved = (this.allProgress && this.allProgress[p.id]) || { foundWords: [], stars: 0 };
      const card = document.createElement("button");
      card.type = "button";
      card.className = "puzzle-option-card" + (idx === this.puzzleIndex ? " current" : "");
      card.innerHTML = `
        <div class="p-card-title">${p.title}</div>
        <div class="p-card-letters">⭐ ${p.center}  +  ${p.outer.join(" ")}</div>
        <div class="p-card-progress">⭐ ${saved.stars || 0} Stars • ${(saved.foundWords || []).length} Words</div>
      `;
      card.addEventListener("click", () => {
        this.initPuzzle(idx, false);
        document.getElementById("puzzle-modal").classList.add("hidden");
      });
      grid.appendChild(card);
    });
  }

  // --- Event Listeners ---
  bindEvents() {
    window.addEventListener("resize", () => this.resizeCanvases());

    // Honeycomb Canvas pointer events
    const getCanvasCoords = e => {
      const rect = this.hcCanvas.getBoundingClientRect();
      const scaleX = 380 / rect.width;
      const scaleY = 340 / rect.height;
      return {
        x: (e.clientX - rect.left) * scaleX,
        y: (e.clientY - rect.top) * scaleY,
        clientX: e.clientX,
        clientY: e.clientY
      };
    };

    const findCellAt = (x, y) => {
      for (let i = 0; i < this.hexCells.length; i++) {
        const c = this.hexCells[i];
        const dx = x - c.x;
        const dy = y - c.y;
        if (Math.hypot(dx, dy) <= c.r * 0.92) {
          return i;
        }
      }
      return -1;
    };

    this.hcCanvas.addEventListener("pointerdown", e => {
      e.preventDefault();
      const pt = getCanvasCoords(e);
      const idx = findCellAt(pt.x, pt.y);
      if (idx >= 0) {
        this.tapLetter(this.hexCells[idx].letter, idx);
        this.spawnBurst(pt.clientX, pt.clientY, 6, false);
      }
    });

    this.hcCanvas.addEventListener("pointermove", e => {
      const pt = getCanvasCoords(e);
      this.hoveredCell = findCellAt(pt.x, pt.y);
    });

    this.hcCanvas.addEventListener("pointerleave", () => {
      this.hoveredCell = -1;
    });

    // Keyboard support
    window.addEventListener("keydown", e => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "Backspace" || e.key === "Delete") {
        e.preventDefault();
        this.deleteLetter();
      } else if (e.key === "Enter") {
        e.preventDefault();
        this.submitWord();
      } else if (e.key === " ") {
        e.preventDefault();
        this.shuffleOuterLetters();
      } else if (/^[a-zA-Z]$/.test(e.key)) {
        const letter = e.key.toUpperCase();
        if (this.allowedSet.has(letter)) {
          this.tapLetter(letter);
        } else {
          this.playGentleOops();
          this.showToast(`"${letter}" isn't in this honeycomb!`, "oops");
        }
      }
    });

    // Buttons
    document.getElementById("delete-btn").addEventListener("click", () => this.deleteLetter());
    document.getElementById("clear-word-btn").addEventListener("click", () => this.clearWord());
    document.getElementById("shuffle-btn").addEventListener("click", () => this.shuffleOuterLetters());
    document.getElementById("hint-btn").addEventListener("click", () => this.showHint());
    document.getElementById("submit-btn").addEventListener("click", () => this.submitWord());

    document.getElementById("hint-close-btn").addEventListener("click", () => this.closeHint());
    document.getElementById("hint-speak-btn").addEventListener("click", () => {
      if (this.activeHintWord && KID_WORDS[this.activeHintWord]) {
        this.speak(`${KID_WORDS[this.activeHintWord].clue}. Starts with ${this.activeHintWord[0]}.`);
      }
    });

    document.getElementById("voice-toggle-btn").addEventListener("click", () => {
      this.voiceEnabled = !this.voiceEnabled;
      this.renderUI();
      this.saveState();
      if (this.voiceEnabled) {
        this.speak("Voice is on!");
      }
    });

    document.getElementById("bee-mascot").addEventListener("click", e => {
      this.playSuccessChime(false);
      this.spawnBurst(e.clientX || 120, e.clientY || 60, 20, true);
      this.speak("Bzzzz! Hi Haze! Let's spell some words!");
    });

    document.getElementById("puzzle-select-btn").addEventListener("click", () => {
      this.renderPuzzleModal();
      document.getElementById("puzzle-modal").classList.remove("hidden");
    });

    document.getElementById("close-modal-btn").addEventListener("click", () => {
      document.getElementById("puzzle-modal").classList.add("hidden");
    });

    document.getElementById("reset-puzzle-btn").addEventListener("click", () => {
      if (confirm("Start this honeycomb puzzle over from 0 stars?")) {
        this.initPuzzle(this.puzzleIndex, true);
        this.showToast("Fresh honeycomb ready! 🍯");
      }
    });

    document.getElementById("keep-playing-btn").addEventListener("click", () => {
      document.getElementById("queen-modal").classList.add("hidden");
    });

    document.getElementById("next-puzzle-btn").addEventListener("click", () => {
      document.getElementById("queen-modal").classList.add("hidden");
      const nextIdx = (this.puzzleIndex + 1) % PUZZLES.length;
      this.initPuzzle(nextIdx, false);
    });
  }
}

window.addEventListener("DOMContentLoaded", () => {
  window.game = new SpellingBeeGame();
});
