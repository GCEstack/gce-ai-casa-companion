# Casa Companion Phase 3 — Batch Generation for Kimi Desktop

Source images: `pipelines/hero-video/heroes_phase3/`

Steps for each clip:
1. Open Kimi Desktop Web image-to-video.
2. Upload the source image from `heroes_phase3/`.
3. Copy the **Motion prompt** into the prompt field.
4. Copy the **Negative prompt** into the negative prompt field.
5. Generate.
6. Download the video and save it to `web-revamp/public/videos/` with the exact filename shown.

After all 16 clips are generated, copy:
`pipelines/hero-video/characters_manifest_update.json` → `web-revamp/public/characters_manifest.json`

---

## Quick Reference Table

| # | Character | Variant | Source Image | Output Filename |
|---|-----------|---------|--------------|-----------------|
| 1 | `agenda` | speaking | `agenda.png` | `agenda_speaking.mp4` |
| 2 | `alien` | speaking | `alien.png` | `alien_speaking.mp4` |
| 3 | `dragon_v2` | idle | `dragon_v2.png` | `dragon_v2_idle.mp4` |
| 4 | `dragon_v2` | speaking | `dragon_v2.png` | `dragon_v2_speaking.mp4` |
| 5 | `fraggl` | speaking | `fraggl.png` | `fraggl_speaking.mp4` |
| 6 | `grouch` | speaking | `grouch.png` | `grouch_speaking.mp4` |
| 7 | `lotso` | speaking | `lotso.png` | `lotso_speaking.mp4` |
| 8 | `lotso_baby` | speaking | `lotso_baby.png` | `lotso_baby_speaking.mp4` |
| 9 | `lotso_mobster` | speaking | `lotso_mobster.png` | `lotso_mobster_speaking.mp4` |
| 10 | `lucha_bee` | speaking | `lucha_bee.png` | `lucha_bee_speaking.mp4` |
| 11 | `mija` | speaking | `mija.png` | `mija_speaking.mp4` |
| 12 | `ninja_cat` | speaking | `ninja_cat.png` | `ninja_cat_speaking.mp4` |
| 13 | `papa` | speaking | `papa.png` | `papa_speaking.mp4` |
| 14 | `pirate_parrot` | speaking | `pirate_parrot.png` | `pirate_parrot_speaking.mp4` |
| 15 | `transformer_bot` | speaking | `transformer_bot.png` | `transformer_bot_speaking.mp4` |
| 16 | `trex` | speaking | `trex.png` | `trex_speaking.mp4` |

---

## Per-Clip Prompts

### 1. Agenda — SPEAKING

**Source image:** `agenda.png`

**Output filename:** `agenda_speaking.mp4`

**Motion prompt:**

```
elegant Agenda gently breathing, soft blink, subtle smile, hair swaying slightly, holding planner and snack with a graceful little gesture, castle background alive with soft light. The character is speaking directly to a child — mouth opening and closing rhythmically with each word, expressive gentle facial expressions, slight head bobbing, warm friendly demeanor. Engaging, lively, cinematic lighting. Loopable talking motion, no camera movement, centered character.
```

**Negative prompt:**

```
frozen still, no facial movement, blurry face, distorted hands, mannequin, changing background
```

---

### 2. Alien — SPEAKING

**Source image:** `alien.png`

**Output filename:** `alien_speaking.mp4`

**Motion prompt:**

```
cute teal alien gently bobbing, three big eyes blinking one after another, glowing antennae tips pulsing, soft bubbles floating by, friendly curious expression. The character is speaking directly to a child — mouth opening and closing rhythmically with each word, expressive gentle facial expressions, slight head bobbing, warm friendly demeanor. Engaging, lively, cinematic lighting. Loopable talking motion, no camera movement, centered character.
```

**Negative prompt:**

```
no glow or magic, frozen still, blurry, distorted, warping, scary, aggressive
```

---

### 3. Dragon v2 — IDLE

**Source image:** `dragon_v2.png`

**Output filename:** `dragon_v2_idle.mp4`

**Motion prompt:**

```
A soft cute plush Dragon v2 character, friendly green dragon waving gently, small wings fluttering, nostrils puffing soft smoke, tail swaying, satchel strap shifting, warm forest light flickering. Subtle calm motion, gentle breathing, soft peaceful blinks, alive and natural. Warm cinematic lighting, soothing atmosphere, friendly and gentle. Loopable, no camera movement, centered character.
```

**Negative prompt:**

```
no glow or magic, frozen still, blurry, distorted, warping, fire blast, scary
```

---

### 4. Dragon v2 — SPEAKING

**Source image:** `dragon_v2.png`

**Output filename:** `dragon_v2_speaking.mp4`

**Motion prompt:**

```
friendly green dragon waving gently, small wings fluttering, nostrils puffing soft smoke, tail swaying, satchel strap shifting, warm forest light flickering. The character is speaking directly to a child — mouth opening and closing rhythmically with each word, expressive gentle facial expressions, slight head bobbing, warm friendly demeanor. Engaging, lively, cinematic lighting. Loopable talking motion, no camera movement, centered character.
```

**Negative prompt:**

```
no glow or magic, frozen still, blurry, distorted, warping, fire blast, scary
```

---

### 5. Fraggl — SPEAKING

**Source image:** `fraggl.png`

**Output filename:** `fraggl_speaking.mp4`

**Motion prompt:**

```
furry orange Fraggl gently swaying, big smile widening, fluffy red hair bouncing, large ears twitching, crystal cave lights shimmering softly. The character is speaking directly to a child — mouth opening and closing rhythmically with each word, expressive gentle facial expressions, slight head bobbing, warm friendly demeanor. Engaging, lively, cinematic lighting. Loopable talking motion, no camera movement, centered character.
```

**Negative prompt:**

```
frozen still, no fur movement, blurry, distorted, warping, scary
```

---

### 6. Grouch — SPEAKING

**Source image:** `grouch.png`

**Output filename:** `grouch_speaking.mp4`

**Motion prompt:**

```
grumpy green Grouch slowly blinking, shaggy fur ruffling, trash can lid wobbling, unimpressed head tilt, soft alley breeze. The character is speaking directly to a child — mouth opening and closing rhythmically with each word, expressive gentle facial expressions, slight head bobbing, warm friendly demeanor. Engaging, lively, cinematic lighting. Loopable talking motion, no camera movement, centered character.
```

**Negative prompt:**

```
frozen still, no fur movement, blurry, distorted, warping, happy expression
```

---

### 7. Lotso — SPEAKING

**Source image:** `lotso.png`

**Output filename:** `lotso_speaking.mp4`

**Motion prompt:**

```
two-toned Lotso bear slowly turning his head, serious expression shifting, suit fabric moving, cigar smoke drifting, imposing but calm stance. The character is speaking directly to a child — mouth opening and closing rhythmically with each word, expressive gentle facial expressions, slight head bobbing, warm friendly demeanor. Engaging, lively, cinematic lighting. Loopable talking motion, no camera movement, centered character.
```

**Negative prompt:**

```
frozen still, no fur movement, blurry, distorted, warping, cute expression
```

---

### 8. Lotso Baby — SPEAKING

**Source image:** `lotso_baby.png`

**Output filename:** `lotso_baby_speaking.mp4`

**Motion prompt:**

```
adorable baby Lotso bear waving a paw, big sparkly eyes blinking, strawberry wobbling, bib swaying, soft nursery decorations floating gently. The character is speaking directly to a child — mouth opening and closing rhythmically with each word, expressive gentle facial expressions, slight head bobbing, warm friendly demeanor. Engaging, lively, cinematic lighting. Loopable talking motion, no camera movement, centered character.
```

**Negative prompt:**

```
frozen still, no fur movement, blurry, distorted, warping, adult expression
```

---

### 9. Lotso Mobster — SPEAKING

**Source image:** `lotso_mobster.png`

**Output filename:** `lotso_mobster_speaking.mp4`

**Motion prompt:**

```
elder Lotso bear tapping his cane gently, wise calm breathing, colorful sash swaying, scar expression shifting, warm fireplace glow flickering. The character is speaking directly to a child — mouth opening and closing rhythmically with each word, expressive gentle facial expressions, slight head bobbing, warm friendly demeanor. Engaging, lively, cinematic lighting. Loopable talking motion, no camera movement, centered character.
```

**Negative prompt:**

```
frozen still, no fur movement, blurry, distorted, warping, young expression
```

---

### 10. Lucha Bee — SPEAKING

**Source image:** `lucha_bee.png`

**Output filename:** `lucha_bee_speaking.mp4`

**Motion prompt:**

```
mighty luchador bee flexing proudly, antennae bouncing, championship belt glinting, cape fluttering, confetti falling slowly, fist pump motion. The character is speaking directly to a child — mouth opening and closing rhythmically with each word, expressive gentle facial expressions, slight head bobbing, warm friendly demeanor. Engaging, lively, cinematic lighting. Loopable talking motion, no camera movement, centered character.
```

**Negative prompt:**

```
frozen still, no wing or cape movement, blurry, distorted, warping
```

---

### 11. Mija — SPEAKING

**Source image:** `mija.png`

**Output filename:** `mija_speaking.mp4`

**Motion prompt:**

```
caring Mija gently breathing, soft warm smile, dark hair flowing, holding heart-shaped baby frame with a tender gesture, clinic lights calm and steady. The character is speaking directly to a child — mouth opening and closing rhythmically with each word, expressive gentle facial expressions, slight head bobbing, warm friendly demeanor. Engaging, lively, cinematic lighting. Loopable talking motion, no camera movement, centered character.
```

**Negative prompt:**

```
frozen still, no facial movement, blurry face, distorted hands, mannequin
```

---

### 12. Ninja Cat — SPEAKING

**Source image:** `ninja_cat.png`

**Output filename:** `ninja_cat_speaking.mp4`

**Motion prompt:**

```
stealthy ninja cat adjusting stance, headband ribbon fluttering, tail swaying, staff spinning slowly, cherry blossom petals drifting, ears twitching alertly. The character is speaking directly to a child — mouth opening and closing rhythmically with each word, expressive gentle facial expressions, slight head bobbing, warm friendly demeanor. Engaging, lively, cinematic lighting. Loopable talking motion, no camera movement, centered character.
```

**Negative prompt:**

```
frozen still, no fur or fabric movement, blurry, distorted, warping
```

---

### 13. Papa — SPEAKING

**Source image:** `papa.png`

**Output filename:** `papa_speaking.mp4`

**Motion prompt:**

```
confident Papa smiling, leaning back in DJ chair, headphones shifting, tattooed arm flexing slightly, castle sunset light changing, whiskey bottle glinting. The character is speaking directly to a child — mouth opening and closing rhythmically with each word, expressive gentle facial expressions, slight head bobbing, warm friendly demeanor. Engaging, lively, cinematic lighting. Loopable talking motion, no camera movement, centered character.
```

**Negative prompt:**

```
frozen still, no facial movement, blurry face, distorted hands, mannequin
```

---

### 14. Pirate Parrot — SPEAKING

**Source image:** `pirate_parrot.png`

**Output filename:** `pirate_parrot_speaking.mp4`

**Motion prompt:**

```
colorful pirate parrot squawking happily, pirate hat tipping, eye patch steady, wings flapping once, tail feathers ruffling, ocean waves rolling behind. The character is speaking directly to a child — mouth opening and closing rhythmically with each word, expressive gentle facial expressions, slight head bobbing, warm friendly demeanor. Engaging, lively, cinematic lighting. Loopable talking motion, no camera movement, centered character.
```

**Negative prompt:**

```
wings clipped, no wing movement, blurry feathers, frozen pose
```

---

### 15. Transformer Bot — SPEAKING

**Source image:** `transformer_bot.png`

**Output filename:** `transformer_bot_speaking.mp4`

**Motion prompt:**

```
heroic robot slowly raising a hand in greeting, blue eyes glowing brighter, chest light pulsing, arm panels shifting subtly, city background alive with soft motion. The character is speaking directly to a child — mouth opening and closing rhythmically with each word, expressive gentle facial expressions, slight head bobbing, warm friendly demeanor. Engaging, lively, cinematic lighting. Loopable talking motion, no camera movement, centered character.
```

**Negative prompt:**

```
lifeless, frozen, blurry, distorted, no light movement, transforming
```

---

### 16. T-Rex — SPEAKING

**Source image:** `trex.png`

**Output filename:** `trex_speaking.mp4`

**Motion prompt:**

```
cute baby T-Rex bouncing excitedly, tiny arms wiggling, big friendly eyes blinking, red sneakers tapping, flower field swaying in breeze. The character is speaking directly to a child — mouth opening and closing rhythmically with each word, expressive gentle facial expressions, slight head bobbing, warm friendly demeanor. Engaging, lively, cinematic lighting. Loopable talking motion, no camera movement, centered character.
```

**Negative prompt:**

```
frozen still, no movement, blurry, distorted, warping, scary, roaring
```

---
