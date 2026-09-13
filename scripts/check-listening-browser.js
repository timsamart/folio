// Playwright CLI run-code. Engine timing is controlled here; real voices are
// enumerated separately. No provider text is sent over the network in this test.
async page => {
  const checks = [], errors = [];
  const check = (ok, message) => { if (!ok) throw new Error(message); checks.push(message); };
  page.on('pageerror', e => errors.push(e.message));
  await page.context().addInitScript(() => {
    window.__spoken = []; window.__utterance = null;
    const local = { voiceURI:'test-local', name:'Installed voice', lang:'en-GB', localService:true };
    Object.defineProperty(window, 'speechSynthesis', { configurable:true, value: {
      getVoices: () => [local, {voiceURI:'network',name:'Online voice',lang:'en-US',localService:false}],
      addEventListener(){}, removeEventListener(){},
      speak(u) { window.__spoken.push({text:u.text,voice:u.voice.voiceURI}); window.__utterance = u; },
      cancel() { const u=window.__utterance; window.__utterance=null; u?.onerror?.({error:'canceled'}); },
    }});
    window.SpeechSynthesisUtterance = class { constructor(text) { this.text=text; } };
    window.__finishSpeech = () => { const u=window.__utterance; window.__utterance=null; u?.onend?.(); };
  });
  await page.reload();
  await page.waitForSelector('#desktop-outline .outline-play', { state: 'attached' });
  await page.setViewportSize({width:390,height:844});
  await page.locator('[data-action="listen"]').first().click();
  await page.waitForSelector('#listen-voice');
  check(await page.locator('#listen-voice option').count() === 1,'Only localService=true voices are offered');
  await page.locator('[data-listen="ready"]').click();
  check(await page.locator('.paragraph-play:visible').count() > 4,'Paragraph controls appear only in listening mode');
  await page.locator('.paragraph-play:visible').first().click();
  await page.waitForFunction(() => window.__spoken.length === 1);
  check((await page.evaluate(() => window.__spoken[0])).text.startsWith('Good ideas'),'Paragraph speech contains authored text');
  check(await page.locator('[data-listen="previous"]').isDisabled() && await page.locator('[data-listen="next"]').isDisabled(),'Paragraph-only navigation is bounded');
  await page.locator('[data-listen="toggle"]').click();
  await page.locator('[data-listen="toggle"]').click();
  await page.waitForFunction(() => window.__spoken.length === 2);
  check(await page.evaluate(() => window.__spoken[0].text === window.__spoken[1].text),'Pause resumes at the interrupted sentence');
  // Finish all sentences in the paragraph, without racing browser event delivery.
  for (let i=0;i<10;i++) {
    if ((await page.locator('#listening-state').textContent()).startsWith('Finished')) break;
    await page.evaluate(() => window.__finishSpeech()); await page.waitForTimeout(30);
  }
  check((await page.locator('#listening-state').textContent()).startsWith('Finished'),'Paragraph playback finishes without continuing');
  await page.locator('[data-action="outline"]').click();
  await page.locator('#sheet [data-listen-section="reading-give-every-detail-its-due"]').click();
  await page.waitForFunction(() => window.__utterance !== null);
  await page.evaluate(() => { window.__spoken=[]; });
  for(let i=0;i<15;i++) {
    if ((await page.locator('#listening-state').textContent()).startsWith('Finished')) break;
    await page.evaluate(() => window.__finishSpeech()); await page.waitForTimeout(30);
  }
  const math = await page.evaluate(() => window.__spoken.map(v=>v.text).join(' '));
  check(math.includes('inline equation') && math.includes('Equation.'),'Math gets one semantic announcement');
  check(!math.includes('frac') && !math.includes('Footnote links work') && !math.includes('Wrap'),'Math markup, footnotes and renderer controls stay out of speech');
  check(!math.includes('There is no finish line'),'Section stops before the next heading');
  await page.locator('[data-action="outline"]').click();
  await page.locator('#sheet [data-listen-section="reading-see-the-whole-idea"]').click();
  await page.waitForFunction(() => !!window.__utterance);
  await page.locator('[data-listen="toggle"]').click();
  await page.reload();
  await page.waitForSelector('.listening-player:not([hidden])');
  check((await page.locator('#listening-state').textContent()).startsWith('Paused') && await page.evaluate(() => window.__spoken.length===0),'Reload restores the listening place without autoplay');
  check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),'Mobile reading and player have no horizontal overflow');
  const box = await page.locator('.listening-player').boundingBox(), dock = await page.locator('.mobile-dock').boundingBox();
  check(box.y+box.height <= dock.y,'Player clears the mobile navigation');
  await page.screenshot({path:'output/playwright/listening-mobile.png'});
  await page.context().setOffline(true);
  try {
    await page.reload(); await page.waitForSelector('.listening-player:not([hidden])');
    await page.locator('[data-listen="toggle"]').click();
    await page.waitForFunction(() => window.__spoken.length>0);
    check(true,'Offline reload and device-voice playback remain available');
  } finally { await page.context().setOffline(false); }
  await page.locator('[data-listen="close"]').click();
  check(await page.locator('.paragraph-play:visible').count()===0,'Closing listening restores the quiet reading view');
  await page.setViewportSize({width:1440,height:1000});
  await page.screenshot({path:'output/playwright/listening-desktop.png'});
  check(errors.length===0,`No uncaught JavaScript errors: ${errors.join('; ')}`);
  return {passed:checks.length,checks};
}
