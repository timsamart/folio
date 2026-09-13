import { buildReadingModel, sectionRange } from './model.js';
import { PlaybackController } from './controller.js';
import { createDeviceProvider } from './providers.js';
import { escapeHTML as esc } from '../renderer.js';
import { isNative } from '../native.js';
import './listening.css';

export function createListening({ container, showSheet, closeSheet, toast }) {
  const provider = createDeviceProvider();
  let model, documentId, enabled = false, follow = true, lastBlock, voices = [], previewEpoch = 0, loadEpoch = 0;
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem('folio-listening') || '{}'); } catch {}
  const player = document.createElement('section');
  player.className = 'listening-player'; player.hidden = true; player.setAttribute('aria-label', 'Read aloud player');
  player.innerHTML = `<div class="listening-caption"><span id="listening-state" role="status">Ready to listen</span><button data-listen="close" aria-label="Close listening controls">×</button></div><div class="listening-controls"><button data-listen="previous" aria-label="Previous passage">↤</button><button data-listen="toggle" class="listen-primary" aria-label="Play">▶</button><button data-listen="next" aria-label="Next passage">↦</button><button data-listen="settings" class="listen-settings">Voice · 1×</button><button data-listen="follow" aria-label="Show spoken passage">Locate</button></div>`;
  document.body.append(player);
  const control = name => player.querySelector(`[data-listen="${name}"]`);
  const controller = new PlaybackController(provider, state => {
    if (!model || state.status === 'idle' || state.end <= state.start) {
      container.querySelectorAll('.is-speaking').forEach(n => n.classList.remove('is-speaking'));
      return;
    }
    player.hidden = false; document.body.classList.add('has-listening-player');
    const block = model.blocks[state.index];
    container.querySelectorAll('.is-speaking').forEach(n => n.classList.remove('is-speaking'));
    if (block && state.status !== 'ended') block.element.classList.add('is-speaking');
    if (follow && lastBlock !== block?.id && state.status === 'playing') locate();
    lastBlock = block?.id;
    player.querySelector('#listening-state').textContent = `${state.status === 'playing' ? 'Listening' : state.status === 'ended' ? 'Finished' : 'Paused'} · ${state.label}`;
    control('toggle').textContent = state.status === 'playing' ? 'Ⅱ' : '▶';
    control('toggle').setAttribute('aria-label', state.status === 'playing' ? 'Pause' : state.status === 'ended' ? 'Replay' : 'Play');
    control('previous').disabled = state.index <= state.start;
    control('next').disabled = state.index + 1 >= state.end;
    control('settings').textContent = `Voice · ${state.rate}×`;
    if (state.error) toast(state.error);
    if (documentId) {
      try { localStorage.setItem(`folio-listening-place:${documentId}`, JSON.stringify({ version: model.version, start: state.start, end: state.end, index: state.index, chunk: state.chunk, label: state.label, ended: state.status === 'ended' })); } catch {}
    }
  });
  controller.rate = [0.75, 1, 1.15, 1.25, 1.5, 1.75, 2].includes(saved.rate) ? saved.rate : 1;

  function locate() {
    const element = model?.blocks[controller.index]?.element;
    if (element) element.scrollIntoView({ block: 'center', behavior: 'instant' });
  }
  const unfollow = () => { follow = false; control('follow').textContent = 'Locate'; };
  window.addEventListener('wheel', unfollow, { passive: true });
  window.addEventListener('touchmove', unfollow, { passive: true });
  window.addEventListener('keydown', event => { if (['ArrowDown','ArrowUp','PageDown','PageUp','Home','End',' '].includes(event.key)) unfollow(); });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { previewEpoch++; if (controller.status === 'playing') void controller.pause(); else void provider.stop(); }
  });
  window.addEventListener('pagehide', () => { previewEpoch++; void controller.pause(); });

  async function available() {
    voices = await provider.voices();
    const voice = voices.find(v => v.id === saved.voice) || voices.find(v => v.lang.toLowerCase().startsWith(navigator.language.split('-')[0].toLowerCase())) || voices[0];
    if (voice) { controller.voice = voice.id; controller.lang = voice.lang; }
    return !!voice;
  }
  function setEnabled(on) {
    enabled = on; container.classList.toggle('listen-mode', on);
    document.querySelectorAll('[data-action="listen"]').forEach(b => b.setAttribute('aria-pressed', String(on)));
  }
  async function start(range, label) {
    if (!range) return;
    const epoch = ++previewEpoch, version = model?.version;
    if (!await available()) { if (epoch === previewEpoch) await settings(); return; }
    if (epoch !== previewEpoch || version !== model?.version) return;
    setEnabled(true); closeSheet(); follow = true; lastBlock = null;
    void controller.select(range, label);
  }
  async function settings() {
    const epoch = ++previewEpoch;
    await controller.pause();
    let error = '';
    try { await available(); } catch (e) { error = e.message; voices = []; }
    if (epoch !== previewEpoch) return;
    showSheet('A voice for your pages', `<p class="sheet-description">Listen with a voice installed on your device. No document text is sent to a voice provider by Folio. Voice quality depends on your speech engine and downloaded language packs.</p>${voices.length ? `<label class="field-label" for="listen-voice">Device voice</label><select id="listen-voice" class="field-input">${voices.map(v => `<option value="${esc(v.id)}" ${v.id === controller.voice ? 'selected' : ''}>${esc(v.name)} · ${esc(v.lang)}</option>`).join('')}</select><label class="field-label" for="listen-rate">Reading speed</label><select id="listen-rate" class="field-input">${[0.75,1,1.15,1.25,1.5,1.75,2].map(rate => `<option ${rate === controller.rate ? 'selected' : ''} value="${rate}">${rate}×</option>`).join('')}</select><div class="listening-sheet-actions"><button class="secondary-button" data-listen="preview">Preview voice</button><button class="text-button" data-listen="stop-preview">Stop preview</button></div><button class="primary-button" data-listen="ready">Choose a passage</button>` : `<p class="error-message" role="alert">${esc(error || 'No installed offline voice is available to Folio.')}</p><p class="sheet-description">${isNative ? 'Open Android’s text-to-speech settings, choose an engine and download voice data for your language. Return here and refresh the voice list.' : 'Some browsers do not expose local voices. On Android, use the Folio APK and download a language in the system text-to-speech settings.'}</p>`}${isNative ? '<button class="text-button" data-listen="system-settings">Android voice settings</button>' : ''}<button class="text-button" data-listen="settings">Refresh voices</button><p class="field-note">Tap a paragraph’s play button, or the play button beside a heading in the outline. A paragraph ends there; a section includes its subsections. Playback pauses when you leave Folio. Resume restarts the current sentence. Code, diagrams and equations are announced briefly; image descriptions and footnotes are skipped.</p>`);
  }
  async function updateSettings() {
    const voice = voices.find(v => v.id === document.querySelector('#listen-voice')?.value);
    if (!voice) return;
    const rate = Number(document.querySelector('#listen-rate')?.value || controller.rate);
    await controller.configure(voice.id, voice.lang, rate);
    saved = { voice: voice.id, rate };
    try { localStorage.setItem('folio-listening', JSON.stringify(saved)); } catch {}
  }
  document.addEventListener('change', event => { if (['listen-voice','listen-rate'].includes(event.target.id)) { previewEpoch++; void updateSettings(); } });
  document.addEventListener('click', async event => {
    const button = event.target.closest('[data-listen],[data-listen-section],[data-listen-block]');
    if (!button) return;
    try {
      if (button.dataset.listenSection) { await start(sectionRange(model.blocks, button.dataset.listenSection), button.dataset.listenTitle || 'Section'); return; }
      if (button.dataset.listenBlock !== undefined) {
        const index = Number(button.dataset.listenBlock); await start({ start: index, end: index + 1 }, 'One passage'); return;
      }
      switch (button.dataset.listen) {
        case 'settings': await settings(); break;
        case 'system-settings': await provider.settings?.(); break;
        case 'ready': await updateSettings(); previewEpoch++; await provider.stop(); setEnabled(true); closeSheet(); toast('Tap ▶ beside a passage, or choose a section from the outline.'); break;
        case 'preview': {
          await updateSettings(); const epoch = ++previewEpoch;
          await provider.stop(); if (epoch !== previewEpoch) break;
          const samples = { en: 'A little room for what matters. Take a breath, and follow your curiosity.', de: 'Ein wenig Raum für das Wesentliche. Atme durch und folge deiner Neugier.', el: 'Λίγος χώρος για όσα έχουν σημασία. Πάρε μια ανάσα και ακολούθησε την περιέργειά σου.' };
          await provider.speak(samples[controller.lang.split('-')[0]] || samples.en, { voice: controller.voice, rate: controller.rate }); break;
        }
        case 'stop-preview': previewEpoch++; await provider.stop(); break;
        case 'toggle':
          previewEpoch++;
          if (controller.status === 'playing') await controller.pause();
          else if (controller.status === 'ended') void controller.select({ start: controller.start, end: controller.end }, controller.label);
          else void controller.play();
          break;
        case 'previous': previewEpoch++; void controller.move(-1); break;
        case 'next': previewEpoch++; void controller.move(1); break;
        case 'follow': follow = true; locate(); break;
        case 'close': previewEpoch++; await controller.stop(); player.hidden = true; document.body.classList.remove('has-listening-player'); setEnabled(false); break;
      }
    } catch (error) { if (error.message !== 'cancelled') toast(error.message || 'Device speech is unavailable. Try another installed voice.'); }
  });
  document.querySelector('#sheet').addEventListener('close', () => { previewEpoch++; if (controller.status !== 'playing') void provider.stop(); });
  return {
    settings,
    async load(doc) {
      const epoch = ++loadEpoch; previewEpoch++;
      await controller.load([]);
      if (epoch !== loadEpoch) return;
      player.hidden = true; document.body.classList.remove('has-listening-player');
      documentId = doc?.id; lastBlock = null;
      if (!doc) { model = null; return; }
      model = buildReadingModel(container, doc.content);
      controller.blocks = model.blocks;
      for (const block of model.blocks) {
        if (!['P', 'LI'].includes(block.element.tagName)) continue;
        const button = document.createElement('button'); button.className = 'paragraph-play'; button.dataset.listenBlock = String(block.index);
        button.textContent = '▶'; button.setAttribute('aria-label', `Read passage: ${block.text.slice(0, 90)}`);
        block.element.prepend(button);
      }
      setEnabled(enabled);
      try {
        const place = JSON.parse(localStorage.getItem(`folio-listening-place:${doc.id}`) || 'null');
        if (place && place.version === model.version && !place.ended && Number.isInteger(place.start) && Number.isInteger(place.index) && Number.isInteger(place.end) && place.start >= 0 && place.index >= place.start && place.index < place.end && place.end <= model.blocks.length) {
          Object.assign(controller, { start: place.start, end: place.end, index: place.index, chunk: Math.max(0, Number(place.chunk) || 0), label: String(place.label || 'Saved passage'), status: 'paused' });
          if (await available() && epoch === loadEpoch) controller.changed(controller);
        }
      } catch {}
    },
  };
}
