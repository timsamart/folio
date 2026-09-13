import { device, isNative } from '../native.js';

// Trusted internal provider contract: voices(), speak(text, options), stop().
// speak resolves on completion, rejects on error/cancellation. Future generated
// audio providers can implement this boundary without changing document scopes.
export function createDeviceProvider() {
  let pending = null, listener = null, sequence = 0;
  const cancel = () => { pending?.reject(new Error('cancelled')); pending = null; };
  if (isNative) return {
    id: 'android-device',
    async voices() { return (await device.voices()).voices; },
    async speak(text, { voice, rate }) {
      const id = String(++sequence);
      listener ||= await device.addListener('speech', event => {
        if (event.id !== pending?.id) return;
        const request = pending; pending = null;
        event.state === 'done' ? request.resolve() : request.reject(new Error(event.message || 'Speech was interrupted. Tap Play to resume.'));
      });
      if (id !== String(sequence)) throw new Error('cancelled');
      await new Promise((resolve, reject) => {
        pending = { id, resolve, reject };
        device.speak({ text, voice, rate, id }).catch(error => { if (pending?.id === id) { pending = null; reject(error); } });
      });
    },
    async stop() { sequence++; cancel(); await device.stop(); },
    settings: () => device.voiceSettings(),
  };
  const synth = globalThis.speechSynthesis;
  return {
    id: 'browser-device',
    async voices() {
      if (!synth) return [];
      if (!synth.getVoices().length) await new Promise(resolve => {
        const done = () => { clearTimeout(timer); synth.removeEventListener('voiceschanged', done); resolve(); };
        const timer = setTimeout(done, 1200); synth.addEventListener('voiceschanged', done);
      });
      return synth.getVoices().filter(v => v.localService === true).map(v => ({ id: v.voiceURI, name: v.name, lang: v.lang }));
    },
    async speak(text, { voice, rate }) {
      const selected = synth?.getVoices().find(v => v.voiceURI === voice && v.localService === true);
      if (!selected) throw new Error('That offline voice is unavailable. Choose an installed device voice.');
      await new Promise((resolve, reject) => {
        const id = String(++sequence), utterance = new SpeechSynthesisUtterance(text);
        utterance.voice = selected; utterance.lang = selected.lang; utterance.rate = rate;
        pending = { id, resolve, reject, utterance };
        utterance.onend = () => { if (pending?.id === id) { pending = null; resolve(); } };
        utterance.onerror = event => { if (pending?.id === id) { pending = null; reject(new Error(`Device speech stopped (${event.error}). Tap Play to retry.`)); } };
        synth.speak(utterance);
      });
    },
    async stop() { cancel(); synth?.cancel(); },
  };
}
