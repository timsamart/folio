import test from 'node:test';
import assert from 'node:assert/strict';
import { sectionRange, splitSpeech } from '../listening/model.js';
import { PlaybackController } from '../listening/controller.js';

test('a section includes descendants, and stops at an equal or higher heading', () => {
  const blocks = [ {level:1,headingId:'title'}, {level:2,headingId:'a'}, {level:0}, {level:3,headingId:'child'}, {level:0}, {level:2,headingId:'b'}, {level:0}, {level:1,headingId:'other'} ];
  assert.deepEqual(sectionRange(blocks,'a'), {start:1,end:5});
  assert.deepEqual(sectionRange(blocks,'child'), {start:3,end:5});
  assert.deepEqual(sectionRange(blocks,'title'), {start:0,end:7});
  assert.equal(sectionRange(blocks,'missing'), null);
});
test('long and multilingual speech is bounded without splitting surrogate pairs', () => {
  const text = 'Ein Absatz. Ελληνικό κείμενο! ' + '😀'.repeat(700) + ' final sentence.';
  const chunks = splitSpeech(text,'de');
  assert(chunks.length > 3);
  assert(chunks.every(c => c.length <= 280 && !/^[\uDC00-\uDFFF]|[\uD800-\uDBFF]$/.test(c)));
  assert.equal(chunks.join('').replace(/\s/g,''), text.replace(/\s/g,''));
});
const tick = () => new Promise(resolve => setImmediate(resolve));
function setup() {
  const spoken = []; let active;
  const provider = {
    async stop() { active?.reject(new Error('cancelled')); active = null; await tick(); },
    speak(text) { spoken.push(text); return new Promise((resolve,reject) => { active = { resolve,reject }; }); },
    done() { const item = active; active = null; item?.resolve(); },
    fail() { active?.reject(new Error('engine lost')); active = null; },
  };
  const controller = new PlaybackController(provider, () => {});
  controller.blocks = ['First sentence. Second sentence.', 'Nested passage.', 'Outside section.'].map(text => ({text}));
  controller.voice = 'local';
  return {controller,provider,spoken};
}
test('paragraph playback stops at its boundary; pause resumes the current sentence', async () => {
  const {controller:c,provider:p,spoken} = setup();
  void c.select({start:0,end:1},'paragraph'); await tick(); await tick();
  assert.equal(spoken[0],'First sentence.'); p.done(); await tick();
  assert.equal(spoken[1],'Second sentence.'); await c.pause();
  assert.equal(c.status,'paused'); void c.play(); await tick();
  assert.equal(spoken[2],'Second sentence.'); p.done(); await tick();
  assert.equal(c.status,'ended'); assert.equal(spoken.length,3);
});
test('rapid selections cancel stale async starts and never speak outside scope', async () => {
  const {controller:c,provider:p,spoken} = setup();
  void c.select({start:0,end:3},'old'); void c.select({start:1,end:2},'latest');
  for (let i=0;i<5;i++) await tick();
  assert.deepEqual(spoken,['Nested passage.']); p.done(); await tick();
  assert.equal(c.status,'ended'); assert.equal(c.label,'latest');
});
test('document replacement stops speech; late engine completion cannot restart it', async () => {
  const {controller:c,provider:p,spoken} = setup();
  void c.select({start:0,end:3},'section'); await tick(); await tick();
  await c.load([{text:'New document.'}]); p.done(); await tick();
  assert.equal(c.status,'idle'); assert.deepEqual(spoken,['First sentence.']);
});
test('voice failures pause with a recoverable error and navigation stays in scope', async () => {
  const {controller:c,provider:p,spoken} = setup();
  void c.select({start:1,end:2},'section'); await tick(); await tick(); p.fail(); await tick();
  assert.equal(c.status,'paused'); assert.equal(c.error,'engine lost');
  await c.move(1); await c.move(-1); assert.equal(spoken.length,1);
});
