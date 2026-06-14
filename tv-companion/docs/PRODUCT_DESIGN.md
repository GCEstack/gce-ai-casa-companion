# Casa Companion / Capo - Product Design

## What It Is

Casa Companion is an AI-powered plush toy designed for children ages 0-8. The physical toy contains an electronics pod (speaker, microphone, touch sensors, LED eyes, WiFi/BLE, USB-C rechargeable battery) inside a removable, machine-washable plush shell. One pod, ten animal shells. The toy connects to the Capo AI platform for real-time voice conversation powered by Azure OpenAI GPT-4o. The killer feature is voice cloning: a parent or grandparent records 12 phrases via an app, and the toy speaks to the child in that family member's voice. The product targets heritage language preservation (English, Italian, Spanish), screen-free play, and grandparent-grandchild connection across distance. Tagline: "Your Voice. Their Companion."

---

## What Was Built

### 1. Interactive Demo App (casa-companion)
- **URL:** casa-companion-demo.onrender.com
- **Repo:** github.com/simplebalance89-ai/casa-companion
- **Local:** `C:\Claude\Work\casa-companion\`
- **What it does:** Live, working AI demo where visitors talk to 11 companion characters via text chat, tap-to-talk (Whisper STT + GPT-4o-mini TTS), or WebRTC real-time voice mode (Azure OpenAI Realtime API). Includes 12 learning modes, parent dashboard, usage log, and battery simulation.
- **Backend:** FastAPI + Azure OpenAI (GPT-4o chat, GPT-4o Realtime, GPT-4o-mini TTS, Whisper STT)
- **Deployed on:** Render (Docker, Oregon region, Starter plan)
- **Version:** 3.3 (per HTML meta tag)

### 2. Marketing/Vision Site (casa-companion-site)
- **URL:** simplebalance89-ai.github.io/casa-companion-site/ (GitHub Pages static) + Render deployment
- **Repo:** github.com/simplebalance89-ai/casa-companion-site
- **Local:** `C:\Claude\Work\casa-companion-site\`
- **What it does:** Product marketing site with full scrolling narrative (v5), tab-based navigation (v4/original), promo slideshow with audio narration, voice recording studio page, waitlist email capture API.
- **Backend:** FastAPI serving static files + `/api/waitlist` endpoint (writes to CSV)
- **Pages:** `index-v5.html` (v5 scrolling redesign), `index.html` (v4 tab-based), `promo.html` (narrated founder story slideshow), `record.html` (voice recording studio UI)
- **Version:** 5.0 (per HTML meta tag)

### 3. Family Dashboard (casa-gianelli-repo)
- **Local:** `C:\Claude\Work\casa-gianelli-repo\`
- **What it does:** Streamlit-based family command center with 32 pages across 7 groups. Includes GL (Gian Lucca) developmental tools, health protocol tracking, family logistics, J.A.W. Music AI suite, brain dump tools, and AI-powered chat on 7+ pages. This is the origin of the Casa Companion concept -- the "GL's World" section (7 pages: Story Buddy, GL Stories, GL Languages, GL Signs, GL Games, GL Milestones, GL Music) became the foundation for the toy's AI personality and learning modes.
- **Framework:** Streamlit + Azure OpenAI
- **Version:** v5.0 (per sidebar footer)

### 4. Manufacturing Research (casa-gianelli main dir)
- **Local:** `C:\Claude\Work\casa-gianelli\`
- **Contents:** Kinwin Toys manufacturer research (`kinwin_research.md`) and quote request email (`kinwin_quote_email.txt`). Kinwin is a Guangdong, China factory with 17+ years experience, 15 production lines, MOQ 500 units, capable of electronic interactive plush.

### 5. Comprehensive Site Analysis
- **File:** `C:\Claude\Work\casa-companion-site\SITE_ANALYSIS.md`
- **What it is:** 760-line competitive analysis, UX audit, and redesign proposal document covering both sites. Includes competitive research (Moxie, Codi, Toniebox, Yoto, Miko 3), market data, pricing analysis, two vision site redesign wireframes (Investor Pitch vs Emotional Parent Pitch), two demo site redesign wireframes (Guided Experience vs Playground), and prioritized top-10 changes ranked by impact.

### 6. DALL-E Generated Images (via Azure)

**Total: 100+ images across 4 batches**

**Root images/ (35 originals):**
- 6 scene images: father, kids, heroes, grandma, crow, banner
- 6 lifestyle images: boy-crow, bunny-glow, grandparent-distance, nonna-kitchen, toddler-rug, two-kids
- 3 banner images: crow-cinematic, father-recording, grandma-hands
- 2 engineering diagrams: dock, exploded view
- 3 packaging renders: box, shelf, unbox
- 15 hero character portraits: alebrije, bear, bunny, crow, deer, dolphin, dragon, elephant, fox, lion, octopus, otter, owl, turtle, wolf, xolo

**images/generated/ (22 images):**
- 3 lifestyle scenes: elefante-family, delfino-pool, xolo-heritage
- 8 learning mode illustrations: story-time, calm-breathe, stem-sparks, music, geography, italian, spanish, coding
- 5 marketing/product shots: lineup, pod-swap, magnetic-dock, washable, no-screen
- 6 social media assets: corvo-close, gufo-close, orsetto-close, group-pile (x2), child-hug, size-reference

**images/batch2/ (31 images):**
- Character-specific lifestyle photos featuring all 10 companions in family settings: crow-mom-lullaby, lion-family-road-trip, owl-grandma-stories, elephant-dad-daughter, dolphin-kid-pool, bunny-nonna-kitchen, turtle-grandpa-workshop, xolo-dia-muertos, dragon-bedtime, bear-siblings, and more

**images/batch3/ (22 images):**
- Product/marketing shots: lineup-all-ten, magnetic-dock-demo, pod-swap-exploded, packaging-premium-box, size-reference-child, washable-demo, eye-glow-dark, ten-shells-circle, kickstarter-hero
- Grandparent-focused: nonna-recording-voice, abuelo-xolo-story, grandma-distance-owl, nonna-facetime-crow
- Beta testing: florida-test-nephews
- Scenes: dad-business-trip, projector-ceiling-stars, heritage-language-class, family-dinner-italian

**Additional promo/slide images (6):**
- slide1-dad-baby-crow, slide5-grandma-cooking-phone, slide8-generation-nostalgia, slide9-exploded-engineering, slide-projector-vision, slide-capisce-dinner

### 7. Audio Assets
- **Narration clips:** 10 MP3 files (narration-1 through narration-10) for the founder story promo slideshow
- **Raw audio:** 10 WebM recordings (narration-1 through narration-10) in `audio-raw/`

### 8. Demo Character Images
- **Location:** `C:\Claude\Work\casa-companion\static\images\heroes\`
- **Characters:** bear, bunny, crow, dolphin, dragon, elephant, fox, lion, owl, turtle, xolo (11 PNGs)
- **Plus:** corvo.png in `static/images/`

---

## Current State

### What's Live
- **Demo site:** casa-companion-demo.onrender.com -- functional. 11 AI companions with distinct personalities, text chat, tap-to-talk voice, WebRTC real-time voice, 12 learning modes, parent dashboard. Hosted on Render Starter plan (Docker).
- **Vision site:** Render deployment with FastAPI backend, waitlist email capture. GitHub Pages version also exists at simplebalance89-ai.github.io/casa-companion-site/.
- **Both repos** deployed with Dockerfiles, render.yaml configs, and health check endpoints.

### What's Working
- Real-time AI conversation with all 11 companions (Corvo, Gufo, Orsetto, Coniglio, Tartaruga, Elefante, Leone, Delfino, Drago, Xolo, Polpo)
- 12 learning modes: Introduction, Story Time, Calm & Breathe, STEM Sparks, Music & Rhythm, Geography, Italian, Spanish, Coding Logic, Homework Helper, Parent Mode, Usage Log
- WebRTC real-time voice via Azure OpenAI Realtime API
- Whisper STT + GPT-4o-mini TTS for tap-to-talk mode
- Waitlist email capture (CSV-based on vision site)
- Narrated founder story slideshow (promo.html)
- Voice recording studio UI (record.html)
- Copyright guard preventing use of trademarked characters
- Factual accuracy and brevity rules in all character prompts

### What's Broken or Incomplete
- **No custom domain.** Both sites use platform URLs (onrender.com, github.io).
- **Render cold start.** Free/Starter tier spins down after inactivity. 30-60 second wait for first visitor.
- **Azure API key exposed in client-side JS** in the demo site source code.
- **No persistent storage.** Waitlist is a local CSV file. No database.
- **No authentication.** No parent login, no user accounts.
- **No voice cloning demo.** The #1 differentiator cannot be experienced in the demo.
- **No email list integration.** Waitlist CSV is not connected to Mailchimp/ConvertKit.
- **No analytics.** No tracking on either site.
- **No legal pages.** No privacy policy, terms of service, or COPPA compliance statement.
- **No social media presence.** No Instagram, TikTok, or Facebook linked.
- **Casa Gianelli dashboard (Streamlit) is local only.** No deployment, no Dockerfile, no persistent storage. All state resets on restart.
- **Manufacturing:** Quote email drafted to Kinwin but unclear if sent. No prototype exists.

---

## Version History

| Version | Date | What Changed |
|---------|------|-------------|
| 1.0 | ~Jan 2026 | Casa Gianelli Streamlit dashboard created. Family command center with GL's World developmental tools. Origin of Casa Companion concept. |
| 2.0 | ~Jan 2026 | GL's World expanded to 7 pages: Story Buddy, Languages, Signs, Games, Milestones, Music, GL Stories. AI chat integrated. |
| 3.0 | ~Feb 2026 | Casa Gianelli v3.0 "Sidebar Navigation Edition." 19 pages, 5 groups, dark warm theme, modular tab architecture. |
| 5.0 | ~Feb 2026 | Casa Gianelli expanded to 32 pages. Added J.A.W. Music AI suite (10 pages), AI Tools group (Music Finder, Trend Tracker, Casa Classic). |
| Demo 1.0 | ~Feb 2026 | casa-companion repo created. First interactive demo with Corvo character. FastAPI + Azure OpenAI. Deployed to Render. |
| Demo 2.0 | ~Feb 2026 | Expanded to 10+ companions with distinct personalities and Italian names. Added learning modes, parent dashboard, battery simulation. |
| Demo 3.3 | ~Feb 2026 | Guided experience with context banner, progress indicator, WebRTC real-time voice, 12 learning modes, tap-to-talk. Current version. |
| Vision 1.0 | ~Feb 2026 | casa-companion-site created. Tab-based marketing site with 10 sections. GitHub Pages deployment. |
| Vision 4.0 | ~Feb 2026 | Tab-based version with full product info, pricing, Kickstarter tiers, competitive comparison, grandparent section, founder story promo. |
| Vision 5.0 | Feb 23, 2026 | Full scrolling redesign (index-v5.html). OG meta tags, favicon, CSS variables, scroll reveal animations. Server updated with waitlist API. |
| Analysis | Feb 23, 2026 | SITE_ANALYSIS.md created. 760-line competitive analysis, UX audit, and redesign proposals. |
| Images Batch 1 | ~Feb 2026 | 35 original DALL-E images: hero characters, scenes, lifestyle, engineering, packaging. |
| Images Batch 2 | ~Feb 2026 | 31 additional DALL-E images: character-specific family lifestyle photos for all companions. |
| Images Generated | ~Feb 2026 | 22 DALL-E images: learning mode illustrations, marketing shots, social media assets. |
| Images Batch 3 | ~Feb 2026 | 22 DALL-E images: product shots, grandparent scenes, beta testing, Kickstarter hero. |
| Manufacturing | ~Feb 2026 | Kinwin Toys research completed. Quote email drafted for 3 SKUs (capybara, axolotl, highland cow). |

---

## Phase Rollout Plan

### Phase 1: MVP (What Exists Now)
- Working AI demo with 11 companions and 12 learning modes
- Marketing/vision site with product info, pricing, and founder story
- 100+ DALL-E product images across 4 batches
- Narrated founder story promo slideshow
- Voice recording studio UI prototype
- Waitlist email capture (CSV)
- Manufacturing partner identified (Kinwin Toys, China)
- Competitive analysis and redesign proposals documented

### Phase 2: Pre-Launch (Before May 5, 2026 Kickstarter)
- Register custom domain (casacompanion.com or similar)
- Connect email capture to Mailchimp/ConvertKit
- Build pre-launch email list (target: 5,000+ subscribers)
- Add analytics to both sites (Google Analytics or Plausible)
- Create Kickstarter video from founder story audio + images
- Add legal pages: privacy policy, terms of service, COPPA statement
- Launch social media: Instagram, TikTok, Facebook
- Fix Azure API key exposure (move to server-side proxy)
- Add voice cloning demo or before/after audio sample
- Finalize pricing tiers (resolve inconsistencies between sections)
- Send quote email to Kinwin, schedule call, get prototype timeline
- Beta test footage with nephews (Liam and Logan)
- Influencer outreach program
- Press kit with downloadable assets

### Phase 3: Kickstarter & First Production (May-Nov 2026)
- Launch Kickstarter campaign (May 5, 2026)
- Goal: $50K minimum, real target $100K-250K
- Tiers: $89 Super Early Bird / $99 Standard / $149 Exclusive / $199 Family Pack / $249 Gift Edition / $299 Grandparent Bundle
- Finalize hardware design with manufacturer
- Order prototype (10-15 day timeline from Kinwin)
- First production run: MOQ 500 units per SKU, 30-45 day production
- Safety certifications: CPSIA, FCC, CE, EN71
- Build native parent app (voice cloning, profiles, settings)
- Target delivery: November 2026

### Phase 4: Scale (2027+)
- Retail launch (Amazon, Target, specialty toy stores)
- Expand companion lineup beyond initial 3 SKUs
- Add languages beyond EN/IT/ES
- Build grandparent ecosystem (paired toys, remote voice recording)
- Subscription model: Free / Family $4.99/mo / Premium $9.99/mo / Heritage $14.99/mo
- Offline mode development (prevent Moxie-style bricking)
- API platform for third-party content (Capo as a platform)
- Shark Tank application
- International expansion

---

## Tech Stack

### Demo Site (Interactive)
| Layer | Technology |
|-------|-----------|
| Frontend | Vanilla HTML/CSS/JS |
| Backend | Python FastAPI |
| AI Chat | Azure OpenAI GPT-4o |
| Real-time Voice | Azure OpenAI Realtime API (GPT-4o-realtime) |
| Text-to-Speech | Azure OpenAI GPT-4o-mini TTS |
| Speech-to-Text | Azure OpenAI Whisper |
| Hosting | Render (Docker, Starter plan, Oregon) |
| HTTP Client | httpx (async) |

### Vision Site (Marketing)
| Layer | Technology |
|-------|-----------|
| Frontend | Vanilla HTML/CSS/JS |
| Backend | Python FastAPI (static serving + waitlist API) |
| Fonts | Google Fonts (Playfair Display + Nunito) |
| Hosting | Render (Docker, Starter plan, Oregon) + GitHub Pages |
| Email Capture | CSV file (no CRM integration yet) |

### Family Dashboard (Origin)
| Layer | Technology |
|-------|-----------|
| Framework | Streamlit 1.41+ |
| AI | Azure OpenAI (chat completions) |
| Charts | Plotly |
| Data | Pandas |
| Audio | librosa, soundfile, pydub, mutagen |

### Image Generation
| Tool | Details |
|------|---------|
| DALL-E | Via Azure OpenAI. 100+ product images across hero characters, lifestyle scenes, engineering diagrams, packaging renders, marketing shots, social media assets. |

---

## Key Files & Paths

### Demo App (Interactive)
| File | Purpose |
|------|---------|
| `C:\Claude\Work\casa-companion\server.py` | FastAPI backend. 11 character prompts, 12 learning mode prompts, Azure API proxy endpoints (chat, TTS, STT, realtime token), copyright guard, factual accuracy rules. |
| `C:\Claude\Work\casa-companion\static\index.html` | Demo frontend. Guided experience with context banner, progress steps, companion selection, chat/voice UI. v3.3. |
| `C:\Claude\Work\casa-companion\Dockerfile` | Docker build. Python 3.11-slim, uvicorn on port 10000. |
| `C:\Claude\Work\casa-companion\render.yaml` | Render deployment config. Starter plan, Oregon, Docker runtime. |
| `C:\Claude\Work\casa-companion\static\images\heroes\` | 11 companion character PNGs (bear, bunny, crow, dolphin, dragon, elephant, fox, lion, owl, turtle, xolo). |
| `C:\Claude\Work\casa-companion\tests\` | Test suite: test_demo.py, conftest.py. |

### Vision Site (Marketing)
| File | Purpose |
|------|---------|
| `C:\Claude\Work\casa-companion-site\index-v5.html` | v5 scrolling redesign. OG meta tags, CSS variables, scroll reveal, full product narrative. Current default served by FastAPI. |
| `C:\Claude\Work\casa-companion-site\index.html` | v4 tab-based version. 10-section navigation (Home, Product, Features, How It Works, Pricing, Market, Kickstarter, Grandparents, Future Tech, Our Story). |
| `C:\Claude\Work\casa-companion-site\promo.html` | Narrated founder story slideshow. 11 slides with background images, audio narration, Ken Burns animations. CTA slide at end. |
| `C:\Claude\Work\casa-companion-site\record.html` | Voice recording studio UI. Progress dots, clip cards with scripts, recording controls. Prototype of the voice cloning flow. |
| `C:\Claude\Work\casa-companion-site\server.py` | FastAPI backend. Serves static files, `/api/waitlist` email capture (CSV), `/health` endpoint. Routes: `/` (v5), `/v4`, `/v5`. |
| `C:\Claude\Work\casa-companion-site\SITE_ANALYSIS.md` | 760-line competitive analysis, UX audit, redesign proposals. |
| `C:\Claude\Work\casa-companion-site\images\` | 35 original images + `generated/` (22) + `batch2/` (31) + `batch3/` (22) + slide images (6). Total: 116+ PNGs. |
| `C:\Claude\Work\casa-companion-site\audio-raw\` | 10 WebM raw narration recordings. |

### Family Dashboard (Origin)
| File | Purpose |
|------|---------|
| `C:\Claude\Work\casa-gianelli-repo\app.py` | Main Streamlit app. 32 pages, 7 groups, sidebar navigation, GL age tracker. |
| `C:\Claude\Work\casa-gianelli-repo\handoff\HANDOFF.md` | Project handoff doc. Architecture, page registry, state management, design details. |
| `C:\Claude\Work\casa-gianelli-repo\tabs\` | 32 tab modules including GL's World (7 pages), J.A.W. Music AI (10 pages), Family HQ (6), Health (2), Entertainment (2), Voice (2), AI Tools (3). |
| `C:\Claude\Work\casa-gianelli-repo\prompts\` | AI prompt files for GL tools: gl_games.py, gl_languages.py, gl_milestones.py, gl_music.py, gl_signs.py, gl_story_buddy.py, story_buddy.py. |
| `C:\Claude\Work\casa-gianelli-repo\utils\` | Shared utilities: ai_client.py (Azure OpenAI wrapper), state.py (session state + GL age calc), sign_data.py, music_apis.py. |

### Manufacturing
| File | Purpose |
|------|---------|
| `C:\Claude\Work\casa-gianelli\kinwin_research.md` | Kinwin Toys manufacturer research. Capabilities, certifications, contact info. |
| `C:\Claude\Work\casa-gianelli\kinwin_quote_email.txt` | Quote request email for 3 SKUs (capybara, axolotl, highland cow) with full electronics spec. |

---

## Sites & URLs

| Name | URL | Type | Status |
|------|-----|------|--------|
| Demo Site | casa-companion-demo.onrender.com | Interactive AI demo | Live |
| Vision Site (Render) | Render deployment | Marketing + waitlist | Live |
| Vision Site (GitHub Pages) | simplebalance89-ai.github.io/casa-companion-site/ | Static marketing | Live |
| Demo Repo | github.com/simplebalance89-ai/casa-companion | Source code | Active |
| Vision Repo | github.com/simplebalance89-ai/casa-companion-site | Source code | Active |

---

## 11 AI Companions

| # | Name | Animal | Italian Meaning | Voice (TTS) | Realtime Voice | Personality |
|---|------|--------|----------------|-------------|----------------|-------------|
| 1 | Corvo | Crow | Crow | nova | ash | Wise, playful, mischievous. The flagship. |
| 2 | Gufo | Owl | Owl | nova | sage | Calm, bedtime companion. Stargazing, night wisdom. |
| 3 | Orsetto | Bear | Little Bear | nova | coral | Brave, cuddly. Adventures, confidence-building. |
| 4 | Coniglio | Bunny | Bunny | nova | shimmer | Sweet, emotional intelligence. Music, feelings. |
| 5 | Tartaruga | Sea Turtle | Sea Turtle | nova | alloy | Patient, ancient wisdom. Ocean stories, patience. |
| 6 | Elefante | Elephant | Elephant | nova | echo | Gentle giant. Family, memory, nurturing. |
| 7 | Leone | Lion | Lion | nova | echo | Confident, brave. Leadership, courage, roaring. |
| 8 | Delfino | Dolphin | Dolphin | nova | ballad | Playful, joyful. Games, friendship, social. |
| 9 | Drago | Dragon | Dragon | nova | ash | Imaginative, magical. Storytelling, creative play. |
| 10 | Xolo | Xoloitzcuintli | Aztec Dog | nova | verse | Heritage guardian. Culture, loyalty, tradition. |
| 11 | Polpo | Octopus | Octopus | nova | ballad | Demo host. Shows off all capabilities. |

---

## 12 Learning Modes

| Mode | Icon | Focus |
|------|------|-------|
| Introduction | Wave | First meeting, name exchange |
| Story Time | Books | Interactive stories, child as hero |
| Calm & Breathe | Meditation | Breathing exercises, mindfulness, bedtime |
| STEM Sparks | Microscope | Science, math, "did you know" questions |
| Music & Rhythm | Music | Rhythm games, singalongs, sound safari |
| Geography | Globe | Virtual world travel, landmarks, culture |
| Italian | Flag | Italian language immersion |
| Spanish | Flag | Spanish language immersion |
| Coding Logic | Computer | Logic puzzles, if/then, debugging |
| Homework Helper | Pencil | Math, spelling, reading support |
| Parent Mode | Shield | Parent-facing analytics dashboard |
| Usage Log | Chart | Session tracking, conversation summaries |

---

## Hardware Spec (Target)

| Component | Detail |
|-----------|--------|
| Size | 25-30cm |
| Speaker | Small, integrated in plush body |
| Microphone | For voice input / conversation |
| Touch Sensors | Multiple zones: belly, head, paws |
| LED Eyes | Color-changing capability |
| Connectivity | WiFi and/or BLE (cloud AI connection) |
| Battery | Rechargeable, USB-C charging, 6-8hr target |
| Control Board | Central PCB (client-supplied firmware) |
| Volume | Capped at 85dB (child safety) |
| Form Factor | Removable electronics pod + washable plush shell |
| Dock | Magnetic charging dock |
| Initial SKUs | Capybara, Axolotl, Highland Cow (per quote email) |
| Certifications | CPSIA, FCC, CE, EN71, ASTM F963 |

---

## Pricing (Kickstarter Tiers)

| Tier | Price | What's Included |
|------|-------|----------------|
| Super Early Bird | $79-89 | 1 companion + pod + dock. 100 units. |
| Standard Early Bird | $99 | 1 companion + pod + dock. Main tier. |
| Backer Exclusive | $149 | Exclusive colorway + 6mo Heritage sub. |
| Casa Family Pack | $199 | 2 companions + pod + dock. |
| Gift Edition | $249 | Premium packaging + embroidery + Heritage sub. |
| Grandparent Bundle | $299 | 2 paired companions (child + grandparent). The hero tier. |

**Subscription (post-Kickstarter):**
| Tier | Price | Features |
|------|-------|---------|
| Free | $0 | Basic conversation, 1 language |
| Family | $4.99/mo | Full learning modes, 3 languages |
| Premium | $9.99/mo | Voice cloning, unlimited modes |
| Heritage | $14.99/mo | Full voice cloning, heritage language tools, grandparent profiles |

---

## Market Context

| Metric | Value |
|--------|-------|
| Global smart toys market (2024) | $15.06B |
| Projected (2032) | $50.76B (16.4% CAGR) |
| US births/year | 3.59M |
| Parents concerned about screen time | 71% |
| Heritage language loss by 3rd gen | 75% |
| US grandparents | 70M+ |
| Avg grandparent spend/grandkid/year | $2,562 |
| Grandparents out of state | 42% |
| Bilingual parents wanting bilingual kids | 85% |

**Key competitors:** Moxie ($799, dead Dec 2024), Codi ($125, no real AI), Toniebox ($99, no AI), Yoto ($99, no AI), Miko 3 ($199-299, screen, no voice cloning). None offer voice cloning. None target heritage language preservation. The market gap is wide open.
