(function () {
  const BACKEND = 'https://casa-voice-agent.fly.dev';

  function slugify(name) {
    return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  }

  function getCharacter() {
    const parts = window.location.pathname.split('/').filter(Boolean);

    // React routes: /character/:slug or /character/:slug/:mode
    if (parts[0] === 'character' && parts[1]) {
      return parts[1].toLowerCase();
    }

    // Fallback: first path segment is the character slug
    const path = parts[0] || '';
    if (/^[a-z0-9_-]+$/i.test(path)) return path.toLowerCase();

    // Fallback: page title
    const title = document.title.replace(/Casa Companion\s*[|\-–—:]?\s*/i, '').trim();
    if (title) return slugify(title);

    return 'default';
  }

  function setStatus(text) {
    const el = document.getElementById('casa-voice-status');
    if (el) el.textContent = text;
  }

  async function postJSON(path, body) {
    const res = await fetch(`${BACKEND}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const txt = await res.text().catch(() => '');
      throw new Error(`${path} ${res.status}: ${txt}`);
    }
    return res;
  }

  function writeString(view, offset, string) {
    for (let i = 0; i < string.length; i++) {
      view.setUint8(offset + i, string.charCodeAt(i));
    }
  }

  function audioBufferToWavBlob(audioBuffer) {
    const numChannels = audioBuffer.numberOfChannels;
    const sampleRate = audioBuffer.sampleRate;
    const format = 1; // PCM
    const bitDepth = 16;
    const bytesPerSample = bitDepth / 8;
    const blockAlign = numChannels * bytesPerSample;
    const byteRate = sampleRate * blockAlign;

    const samples = audioBuffer.length;
    const dataSize = samples * blockAlign;
    const buffer = new ArrayBuffer(44 + dataSize);
    const view = new DataView(buffer);

    writeString(view, 0, 'RIFF');
    view.setUint32(4, 36 + dataSize, true);
    writeString(view, 8, 'WAVE');
    writeString(view, 12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, format, true);
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, byteRate, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, bitDepth, true);
    writeString(view, 36, 'data');
    view.setUint32(40, dataSize, true);

    const offset = 44;
    for (let i = 0; i < samples; i++) {
      for (let ch = 0; ch < numChannels; ch++) {
        const sample = Math.max(-1, Math.min(1, audioBuffer.getChannelData(ch)[i]));
        const intSample = sample < 0 ? sample * 0x8000 : sample * 0x7FFF;
        view.setInt16(offset + (i * blockAlign) + (ch * bytesPerSample), intSample, true);
      }
    }

    return new Blob([buffer], { type: 'audio/wav' });
  }

  async function convertToWav(webmBlob) {
    const arrayBuffer = await webmBlob.arrayBuffer();
    const audioContext = new AudioContext({ sampleRate: 16000 });
    try {
      const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
      return audioBufferToWavBlob(audioBuffer);
    } finally {
      await audioContext.close();
    }
  }

  async function transcribe(blob, mimeType) {
    let wavBlob = blob;
    if (mimeType.includes('webm') || mimeType.includes('opus')) {
      wavBlob = await convertToWav(blob);
    }

    const base64 = await new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onloadend = () => {
        const s = r.result;
        const idx = s.indexOf(',');
        resolve(idx >= 0 ? s.slice(idx + 1) : s);
      };
      r.onerror = reject;
      r.readAsDataURL(wavBlob);
    });

    const res = await postJSON('/api/transcribe', {
      audio_base64: base64,
      filename: 'recording.wav',
    });
    const j = await res.json();
    return (j.text || '').trim();
  }

  async function chat(character, text) {
    const res = await postJSON('/api/chat', {
      text,
      character,
      mode: 'default',
      history: [],
    });
    const j = await res.json();
    return (j.text || '').trim();
  }

  async function tts(character, text) {
    const res = await fetch(`${BACKEND}/api/tts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, character, mode: 'default', format: 'wav' }),
    });
    if (!res.ok) throw new Error(`tts ${res.status}`);
    const ct = res.headers.get('content-type') || '';
    const buf = await res.arrayBuffer();
    const mime = ct.includes('audio/wav') ? 'audio/wav' : 'audio/mpeg';
    return new Blob([buf], { type: mime });
  }

  function playBlob(blob) {
    return new Promise((resolve) => {
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      audio.onended = () => { URL.revokeObjectURL(url); resolve(); };
      audio.onerror = () => { URL.revokeObjectURL(url); resolve(); };
      audio.play().catch(() => { URL.revokeObjectURL(url); resolve(); });
    });
  }

  function browserFallback(text) {
    return new Promise((resolve) => {
      if (!window.speechSynthesis) return resolve();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = 'en-US';
      u.onend = () => resolve();
      u.onerror = () => resolve();
      window.speechSynthesis.speak(u);
    });
  }

  async function runPipeline(blob, mimeType) {
    const character = getCharacter();
    console.log('[casa] character:', character);

    setStatus('Transcribing…');
    const text = await transcribe(blob, mimeType);
    if (!text) {
      setStatus('No speech detected');
      return;
    }
    console.log('[casa] user:', text);

    setStatus('Thinking…');
    const reply = await chat(character, text);
    if (!reply) {
      setStatus('No reply');
      return;
    }
    console.log('[casa] reply:', reply);

    setStatus('Speaking…');
    try {
      const audioBlob = await tts(character, reply);
      await playBlob(audioBlob);
    } catch (e) {
      console.warn('[casa] TTS failed, browser fallback:', e);
      await browserFallback(reply);
    }
    setStatus('Tap to talk');
  }

  // ── UI ────────────────────────────────────────────────────────────────────

  const micBtn = document.createElement('button');
  micBtn.id = 'casa-voice-mic-btn';
  micBtn.type = 'button';
  micBtn.setAttribute('aria-label', 'Tap to talk');
  micBtn.textContent = '🎙️';
  Object.assign(micBtn.style, {
    position: 'fixed',
    bottom: '24px',
    right: '24px',
    width: '60px',
    height: '60px',
    borderRadius: '50%',
    border: '2px solid rgba(255,255,255,0.2)',
    background: 'rgba(120,50,255,0.9)',
    color: '#fff',
    fontSize: '26px',
    cursor: 'pointer',
    zIndex: '99999',
    boxShadow: '0 6px 24px rgba(0,0,0,0.4)',
    transition: 'background .2s, transform .1s',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  });

  const statusEl = document.createElement('div');
  statusEl.id = 'casa-voice-status';
  statusEl.textContent = 'Tap to talk';
  Object.assign(statusEl.style, {
    position: 'fixed',
    bottom: '92px',
    right: '24px',
    background: 'rgba(0,0,0,0.7)',
    color: '#fff',
    padding: '6px 12px',
    borderRadius: '8px',
    fontSize: '13px',
    fontFamily: 'Inter, system-ui, sans-serif',
    zIndex: '99999',
    pointerEvents: 'none',
  });

  const style = document.createElement('style');
  style.textContent = `
    #casa-voice-mic-btn.recording {
      background: rgba(220,38,38,0.9) !important;
      animation: casa-voice-pulse 1.2s infinite;
    }
    #casa-voice-mic-btn.busy {
      background: rgba(107,114,128,0.9) !important;
      cursor: wait;
    }
    @keyframes casa-voice-pulse {
      0%, 100% { box-shadow: 0 0 0 0 rgba(220,38,38,0.5); }
      50% { box-shadow: 0 0 0 14px rgba(220,38,38,0); }
    }
  `;
  document.head.appendChild(style);

  // ── Recording ─────────────────────────────────────────────────────────────

  let recorder = null;
  let chunks = [];
  let stream = null;
  let recording = false;
  let mimeType = '';

  function pickMime() {
    const candidates = [
      'audio/webm;codecs=opus',
      'audio/webm',
      'audio/ogg;codecs=opus',
      'audio/mp4',
    ];
    for (const m of candidates) {
      if (window.MediaRecorder && MediaRecorder.isTypeSupported(m)) return m;
    }
    return '';
  }

  async function startRecording() {
    if (recording) return;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
      });
      mimeType = pickMime();
      recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);
      chunks = [];

      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunks.push(e.data);
      };

      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        micBtn.classList.remove('recording');
        micBtn.classList.add('busy');

        const blob = new Blob(chunks, { type: mimeType || 'audio/webm' });
        chunks = [];

        try {
          await runPipeline(blob, mimeType || 'audio/webm');
        } catch (err) {
          console.error('[casa] pipeline error:', err);
          setStatus('Error — try again');
        } finally {
          micBtn.classList.remove('busy');
          recording = false;
        }
      };

      recorder.onerror = () => {
        stream.getTracks().forEach((t) => t.stop());
        micBtn.classList.remove('recording', 'busy');
        recording = false;
        setStatus('Mic error');
      };

      recorder.start(100);
      recording = true;
      micBtn.classList.add('recording');
      setStatus('Listening…');

      // Auto-stop after 10 seconds.
      setTimeout(() => {
        if (recording && recorder && recorder.state !== 'inactive') {
          recorder.stop();
        }
      }, 10000);
    } catch (err) {
      console.error('[casa] mic access failed:', err);
      setStatus('Mic blocked');
    }
  }

  function stopRecording() {
    if (recorder && recorder.state !== 'inactive') {
      recorder.stop();
    }
  }

  micBtn.addEventListener('click', () => {
    if (recording) {
      stopRecording();
    } else {
      startRecording();
    }
  });

  function mount() {
    if (!document.getElementById('casa-voice-mic-btn')) {
      document.body.appendChild(micBtn);
    }
    if (!document.getElementById('casa-voice-status')) {
      document.body.appendChild(statusEl);
    }
  }

  if (document.body) {
    mount();
  } else {
    document.addEventListener('DOMContentLoaded', mount);
  }

  // ── Text chat wiring (existing input box) ─────────────────────────────────

  function findChatInput() {
    const inputs = document.querySelectorAll('input[type="text"], input:not([type])');
    for (const input of inputs) {
      const ph = (input.getAttribute('placeholder') || '').toLowerCase();
      if (ph.startsWith('message ') && ph.endsWith('...')) return input;
    }
    return null;
  }

  function findMessageList(input) {
    const wrapper = input.parentElement;
    if (!wrapper) return null;
    const row = wrapper.parentElement;
    if (!row) return null;
    return row.previousElementSibling;
  }

  function appendBubble(list, text, role) {
    if (!list) return;
    const bubble = document.createElement('div');
    const isUser = role === 'user';
    bubble.style.alignSelf = isUser ? 'flex-end' : 'flex-start';
    bubble.style.maxWidth = '80%';
    bubble.style.padding = '10px 14px';
    bubble.style.borderRadius = isUser ? '18px 18px 4px 18px' : '18px 18px 18px 4px';
    bubble.style.background = isUser
      ? 'linear-gradient(135deg, rgba(0,245,255,0.15), rgba(120,50,255,0.12))'
      : 'rgba(240,240,255,0.06)';
    bubble.style.border = isUser
      ? '1px solid rgba(0,245,255,0.12)'
      : '1px solid rgba(240,240,255,0.06)';
    bubble.style.animation = 'msgIn 0.3s ease-out';
    bubble.style.marginBottom = '10px';

    const p = document.createElement('p');
    p.style.fontFamily = '"Inter", sans-serif';
    p.style.fontSize = '13px';
    p.style.color = 'rgba(240,240,255,0.85)';
    p.style.lineHeight = '1.5';
    p.style.margin = '0';
    p.textContent = text;
    bubble.appendChild(p);

    list.appendChild(bubble);
    list.scrollTop = list.scrollHeight;
  }

  async function handleTextSend(input) {
    const text = input.value.trim();
    if (!text) return;
    input.value = '';

    const character = getCharacter();
    const list = findMessageList(input);
    appendBubble(list, text, 'user');

    try {
      const reply = await chat(character, text);
      appendBubble(list, reply, 'assistant');
      setStatus('Speaking…');
      try {
        const audioBlob = await tts(character, reply);
        await playBlob(audioBlob);
      } catch (e) {
        console.warn('[casa] TTS failed, fallback:', e);
        await browserFallback(reply);
      }
    } catch (err) {
      console.error('[casa] text chat failed:', err);
      appendBubble(list, 'Oops, I could not answer right now.', 'assistant');
    }
    setStatus('Tap to talk');
  }

  function wireTextChat() {
    if (window.__casaTextWired) return;
    const input = findChatInput();
    if (!input) return;

    input.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      e.stopImmediatePropagation();
      handleTextSend(input);
    }, true);

    const wrapper = input.parentElement;
    const row = wrapper && wrapper.parentElement;
    const sendBtn = row && row.querySelector('button');
    if (sendBtn) {
      sendBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopImmediatePropagation();
        handleTextSend(input);
      }, true);
    }

    window.__casaTextWired = true;
  }

  wireTextChat();
  const textObserver = new MutationObserver(() => wireTextChat());
  textObserver.observe(document.body, { childList: true, subtree: true });
})();
