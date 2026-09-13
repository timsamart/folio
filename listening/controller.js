import { splitSpeech } from './model.js';

export class PlaybackController {
  constructor(provider, changed) {
    this.provider = provider; this.changed = changed; this.epoch = 0;
    this.status = 'idle'; this.blocks = []; this.index = 0; this.chunk = 0;
    this.start = 0; this.end = 0; this.rate = 1; this.voice = ''; this.lang = 'en';
    this.error = ''; this.label = '';
    this.commands = Promise.resolve();
  }
  // Native stop/start cross an asynchronous bridge: serialize them so a stale
  // stop can never cancel the user's newer selection.
  command(fn) { this.commands = this.commands.catch(() => {}).then(fn); return this.commands; }
  async stop(status = 'idle') {
    ++this.epoch; this.status = status;
    this.changed(this);
    await this.command(() => this.provider.stop());
  }
  async load(blocks) {
    const stopped = this.stop(), epoch = this.epoch;
    await stopped; if (epoch !== this.epoch) return;
    this.blocks = blocks; this.index = 0; this.chunk = 0; this.start = 0; this.end = 0;
  }
  async select({ start, end }, label) {
    const stopped = this.stop(), epoch = this.epoch;
    await stopped; if (epoch !== this.epoch) return;
    this.start = start; this.end = end; this.index = start; this.chunk = 0; this.label = label;
    await this.play();
  }
  async play() {
    if (!this.voice || !this.blocks.length || this.status === 'playing') return;
    const epoch = ++this.epoch;
    this.status = 'playing'; this.error = ''; this.changed(this);
    while (epoch === this.epoch && this.index < this.end) {
      const chunks = splitSpeech(this.blocks[this.index].text, this.lang);
      this.changed(this);
      for (; this.chunk < chunks.length; this.chunk++) {
        try {
          // Wait for the latest cancellation to finish, but do not serialize the
          // whole utterance: stop must be able to interrupt it.
          await this.commands;
          if (epoch !== this.epoch) return;
          await this.provider.speak(chunks[this.chunk], { voice: this.voice, rate: this.rate });
        } catch (error) {
          if (epoch !== this.epoch) return;
          this.status = 'paused'; this.error = error.message; this.changed(this); return;
        }
        if (epoch !== this.epoch) return;
      }
      if (this.index + 1 >= this.end) break;
      this.index++; this.chunk = 0;
    }
    if (epoch === this.epoch) { this.status = 'ended'; this.chunk = 0; this.changed(this); }
  }
  pause() { return this.stop(this.status === 'idle' ? 'idle' : 'paused'); }
  async move(delta) {
    const next = this.index + delta;
    if (next < this.start || next >= this.end) return;
    const stopped = this.stop('paused'), epoch = this.epoch;
    await stopped; if (epoch !== this.epoch) return;
    this.index = next; this.chunk = 0; void this.play();
  }
  async configure(voice, lang, rate) {
    const playing = this.status === 'playing';
    const stopped = this.stop(this.status === 'idle' ? 'idle' : 'paused'), epoch = this.epoch;
    await stopped; if (epoch !== this.epoch) return;
    this.voice = voice; this.lang = lang; this.rate = rate;
    if (playing) void this.play();
    else this.changed(this);
  }
}
