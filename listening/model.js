// Build once from the semantic document, before adding playback controls. This
// snapshot is independent of Mermaid redraws, fonts, theme, and image loading.
export function fingerprint(text) {
  let value = 2166136261;
  for (const c of text) value = Math.imul(value ^ c.codePointAt(0), 16777619);
  return (value >>> 0).toString(36);
}

const blocksSelector = 'h1,h2,h3,h4,h5,h6,p,li,tr,.code-block,.diagram-block,.katex-display';
function speechText(element, own = false) {
  const copy = element.cloneNode(true);
  copy.querySelectorAll('button,script,style,.footnotes,[data-footnote-ref],[data-footnote-backref],.image-placeholder,img,svg').forEach(n => n.remove());
  if (own) copy.querySelectorAll('p,ul,ol,blockquote,pre,figure,table').forEach(n => n.remove());
  copy.querySelectorAll('.katex-display').forEach(n => n.replaceWith(' Equation. '));
  copy.querySelectorAll('.katex').forEach(n => n.replaceWith(' inline equation '));
  copy.querySelectorAll('br').forEach(n => n.replaceWith(' '));
  if (element.tagName === 'TR') return [...copy.children].map(n => n.textContent.trim()).filter(Boolean).join('; ');
  return copy.textContent.replace(/\s+/g, ' ').trim();
}

export function buildReadingModel(container, source) {
  const blocks = [];
  for (const element of container.querySelectorAll(blocksSelector)) {
    if (element.closest('.footnotes') || element.parentElement?.closest('.code-block,.diagram-block,.katex-display,tr')) continue;
    if (element.matches('.katex-display') && element.parentElement?.closest('p,li')) continue;
    let text;
    if (element.matches('.code-block')) text = 'Code block. Source skipped.';
    else if (element.matches('.diagram-block')) text = 'Diagram. Source skipped.';
    else if (element.matches('.katex-display')) text = 'Equation.';
    else text = speechText(element, element.tagName === 'LI');
    if (!text) continue;
    const index = blocks.length;
    const block = { id: `spoken-${index}-${fingerprint(text)}`, index, text, element,
      headingId: /^H[1-6]$/.test(element.tagName) ? element.id : null,
      level: /^H[1-6]$/.test(element.tagName) ? Number(element.tagName[1]) : 0 };
    element.dataset.spokenBlock = String(index);
    blocks.push(block);
  }
  return { version: fingerprint(source), blocks };
}

export function sectionRange(blocks, headingId) {
  const start = blocks.findIndex(b => b.headingId === headingId);
  if (start < 0) return null;
  let end = start + 1;
  while (end < blocks.length && (!blocks[end].level || blocks[end].level > blocks[start].level)) end++;
  return { start, end };
}

// Stay below every Android engine's maximum input length. Pausing restarts the
// current sentence, rather than depending on inconsistent engine pause support.
export function splitSpeech(text, locale = 'en') {
  let sentences;
  try { sentences = [...new Intl.Segmenter(locale, { granularity: 'sentence' }).segment(text)].map(s => s.segment); }
  catch { sentences = text.match(/[^.!?]+[.!?]*\s*/g) || [text]; }
  return sentences.flatMap(sentence => {
    const chunks = [];
    let rest = sentence.trim();
    while (rest.length > 280) {
      let cut = rest.lastIndexOf(' ', 280);
      if (cut < 80) cut = 280;
      if (/^[\uDC00-\uDFFF]$/.test(rest[cut])) cut--;
      chunks.push(rest.slice(0, cut)); rest = rest.slice(cut).trim();
    }
    if (rest) chunks.push(rest);
    return chunks;
  });
}
