(function () {
  'use strict';

  const BACKEND = 'https://casa-voice-agent.fly.dev';

  function getCharacterSlug() {
    const path = window.location.pathname;
    const match = path.match(/\/character\/([^/]+)/);
    return match ? match[1] : 'pietro';
  }

  function findMicButton() {
    const buttons = document.querySelectorAll('button, [role="button"]');
    for (const btn of buttons) {
      const text = (btn.textContent || btn.innerText || '').toLowerCase();
      if (text.includes('tap to talk') || text.includes('tap') || text.includes('talk')) {
        return btn;
      }
    }
    return null;
  }

  function createSideMic() {
    if (document.getElementById('casa-side-mic')) return;
    const btn = document.createElement('button');
    btn.id = 'casa-side-mic';
    btn.innerHTML = `
      <svg viewBox="0 0 24 24" style="width:28px;height:28px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;">
        <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
        <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
        <line x1="12" y1="19" x2="12" y2="23"/>
        <line x1="8" y1="23" x2="16" y2="23"/>
      </svg>
    `;
    btn.style.cssText = `
      position: fixed;
      right: 18px;
      bottom: 18px;
      width: 64px;
      height: 64px;
      border-radius: 50%;
      border: none;
      background: linear-gradient(135deg, #FF6EC7, #00F5FF);
      color: #fff;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      z-index: 9999;
      box-shadow: 0 0 30px rgba(255,110,199,0.4);
      transition: transform 0.15s ease;
    `;
    btn.addEventListener('mousedown', () => { btn.style.transform = 'scale(0.92)'; });
    btn.addEventListener('mouseup', () => { btn.style.transform = 'scale(1)'; });
    document.body.appendChild(btn);
    return btn;
  }

  function createStatus() {
    if (document.getElementById('casa-mic-status')) return document.getElementById('casa-mic-status');
    const el = document.createElement('div');
    el.id = 'casa-mic-status';
    el.style.cssText = `
      position: fixed;
      left: 50%;
      bottom: 100px;
      transform: translateX(-50%);
      padding: 10px 20px;
      border-radius: 999px;
      background: rgba(6,6,16,0.9);
      color: #fff;
      font-family: Inter, system-ui, sans-serif;
      font-size: 14px;
      z-index: 9999;
      pointer-events: none;
      opacity: 0;
      transition: opacity 0.2s ease;
      white-space: nowrap;
    `;
    document.body.appendChild(el);
    return el;
  }

  function showStatus(text) {
    const el = createStatus();
    el.textContent = text;
    el.style.opacity = '1';
  }

  function hideStatus() {
    const el = document.getElementById('casa-mic-status');
    if (el) el.style.opacity = '0';
  }

  async function fetchChat(text, character, mode) {
    const res = await fetch(`${BACKEND}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, character, mode, history: [] })
    });
    if (!res.ok) throw new Error(`Chat ${res.status}`);
    return await res.json();
  }

  async function fetchTTS(text, character, mode) {
    const res = await fetch(`${BACKEND}/api/tts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, character, mode, format: 'wav' })
    });
    if (!res.ok) throw new Error(`TTS ${res.status}`);
    return await res.blob();
  }

  let recognition = null;
  let isListening = false;

  function initRecognition() {
    const Ctor = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Ctor) {
      showStatus('Speech not supported in this browser');
      return null;
    }
    if (recognition) return recognition;

    const rec = new Ctor();
    rec.lang = 'en-US';
    rec.continuous = true;
    rec.interimResults = true;
    rec.maxAlternatives = 1;

    let finalTranscript = '';

    rec.onstart = () => {
      isListening = true;
      showStatus('Listening...');
    };

    rec.onresult = (event) => {
      let final = '';
      let interim = '';
      for (let i = 0; i < event.results.length; i++) {
        const r = event.results[i];
        if (r.isFinal) {
          final += r[0].transcript;
        } else {
          interim += r[0].transcript;
        }
      }
      finalTranscript = final || interim;
      showStatus(finalTranscript || 'Listening...');
    };

    rec.onerror = (event) => {
      if (event.error === 'no-speech') return;
      console.error('Speech error:', event.error);
      showStatus('Mic error: ' + event.error);
      isListening = false;
    };

    rec.onend = () => {
      isListening = false;
      hideStatus();
      if (finalTranscript.trim()) {
        handleTranscript(finalTranscript.trim());
        finalTranscript = '';
      }
    };

    recognition = rec;
    return rec;
  }

  async function handleTranscript(text) {
    const character = getCharacterSlug();
    showStatus('Thinking...');
    try {
      const reply = await fetchChat(text, character, 'default');
      showStatus(reply.text);
      const audio = await fetchTTS(reply.text, character, 'default');
      const url = URL.createObjectURL(audio);
      const a = new Audio(url);
      a.onended = () => URL.revokeObjectURL(url);
      a.play();
    } catch (err) {
      console.error(err);
      showStatus('Voice failed. Try again.');
      setTimeout(hideStatus, 2000);
    }
  }

  function toggleMic() {
    const rec = initRecognition();
    if (!rec) return;
    if (isListening) {
      rec.stop();
    } else {
      rec.start();
    }
  }

  function isLandingPage() {
    const path = window.location.pathname;
    return path === '/' || path === '/index.html';
  }

  function createTartarugaTab() {
    if (document.getElementById('casa-tartaruga-tab')) return;
    const btn = document.createElement('a');
    btn.id = 'casa-tartaruga-tab';
    btn.href = '/character/tartaruga';
    btn.textContent = '🐢 Tartaruga';
    btn.style.cssText = `
      position: fixed;
      top: 18px;
      right: 18px;
      padding: 12px 20px;
      border-radius: 999px;
      background: linear-gradient(135deg, #00F5FF, #FF6EC7);
      color: #fff;
      font-family: Inter, system-ui, sans-serif;
      font-weight: 700;
      font-size: 14px;
      text-decoration: none;
      z-index: 10000;
      box-shadow: 0 0 30px rgba(0,245,255,0.4);
      transition: transform 0.15s ease;
    `;
    btn.addEventListener('mousedown', () => { btn.style.transform = 'scale(0.95)'; });
    btn.addEventListener('mouseup', () => { btn.style.transform = 'scale(1)'; });
    document.body.appendChild(btn);
  }

  function attach() {
    if (isLandingPage()) {
      createTartarugaTab();
    }
    const existing = findMicButton();
    if (existing) {
      existing.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleMic();
      });
    }
    const side = createSideMic();
    side.addEventListener('click', toggleMic);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', attach);
  } else {
    attach();
  }
})();
