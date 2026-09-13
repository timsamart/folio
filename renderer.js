import { Marked } from 'marked';
import markedKatex from 'marked-katex-extension';
import markedFootnote from 'marked-footnote';
import DOMPurify from 'dompurify';
import hljs from 'highlight.js/lib/common';
import katex from 'katex';
import 'katex/dist/katex.min.css';

export const escapeHTML = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const markdown = new Marked({ gfm: true, breaks: false });
markdown.use(markedKatex({ throwOnError: false, trust: false, strict: 'ignore', maxExpand: 1000, maxSize: 20 }));
markdown.use(markedFootnote());
// Raw HTML is text, never a second control surface inside an imported document.
markdown.use({ renderer: {
  html: ({ text }) => escapeHTML(text),
  image: ({ href, text }) => `<span class="image-placeholder" data-image-src="${escapeHTML(href)}" data-image-alt="${escapeHTML(text)}"></span>`,
} });
let diagramSequence = 0;
let diagramQueue = Promise.resolve();

export function stripFrontmatter(content) {
  return content.replace(/^\uFEFF/, '').replace(/^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/, '');
}
export function titleFrom(content, fallback = 'Untitled document') {
  const heading = stripFrontmatter(content).match(/^#\s+(.+)$/m)?.[1];
  return (heading || fallback.replace(/\.(md|markdown|mdown|txt)$/i, '')).replace(/[*_`]/g, '').trim();
}

export function renderDocument(container, content, title = 'Untitled document') {
  // Sanitization is also a defense against unsafe Markdown links and extension output.
  container.innerHTML = DOMPurify.sanitize(markdown.parse(stripFrontmatter(content)), {
    FORBID_TAGS: ['style', 'iframe', 'object', 'embed', 'form'],
    FORBID_ATTR: ['style'],
    ADD_ATTR: ['xmlns'],
  });
  // KaTeX needs its generated layout styles. Re-render its source after sanitization;
  // trust:false prevents URLs/HTML from entering through the TeX interpreter.
  const equations = [...container.querySelectorAll('.katex')].map(node => ({
    node: node.closest('.katex-display') || node,
    source: node.querySelector('annotation')?.textContent,
    display: !!node.closest('.katex-display'),
  }));
  // KaTeX is already loaded by the parser, but keep the trusted insertion explicit.
  equations.forEach(({ node, source, display }) => {
    if (source) node.outerHTML = katex.renderToString(source, { displayMode: display, throwOnError: false, trust: false, strict: 'ignore', maxExpand: 1000, maxSize: 20 });
  });
  if (!container.querySelector('h1')) {
    const heading = document.createElement('h1'); heading.textContent = title; container.prepend(heading);
  }
  const seen = new Map();
  const headings = [...container.querySelectorAll('h1,h2,h3,h4,h5,h6')];
  headings.forEach(heading => {
    const slug = heading.textContent.toLowerCase().normalize('NFKD').replace(/[^\p{L}\p{N}\s-]/gu, '').trim().replace(/\s+/g, '-') || 'section';
    const count = seen.get(slug) || 0;
    seen.set(slug, count + 1);
    heading.id ||= `reading-${slug}${count ? `-${count}` : ''}`;
    heading.tabIndex = -1;
  });
  container.querySelectorAll('a').forEach(link => {
    const href = link.getAttribute('href') || '';
    if (href.startsWith('#')) {
      let fragment;
      try { fragment = decodeURIComponent(href.slice(1)); } catch { return; }
      if (headings.some(h => h.id === `reading-${fragment}`)) link.setAttribute('href', `#reading-${fragment}`);
    } else {
      link.target = '_blank'; link.rel = 'noopener noreferrer';
    }
  });
  // Remote image fetching is opt-in so merely opening a private document makes no request.
  container.querySelectorAll('[data-image-src]').forEach(img => {
    const src = img.dataset.imageSrc || '';
    const alt = img.dataset.imageAlt || '';
    const placeholder = document.createElement('span');
    placeholder.className = 'image-placeholder';
    if (/^https?:\/\//i.test(src)) {
      const button = document.createElement('button');
      button.className = 'text-button';
      button.textContent = `Load image: ${alt || 'external image'}`;
      button.addEventListener('click', () => {
        const image = new Image(); image.alt = alt; image.loading = 'lazy'; image.referrerPolicy = 'no-referrer';
        image.src = src; image.onerror = () => { placeholder.textContent = 'This image could not be loaded. Check your connection.'; };
        placeholder.replaceChildren(image);
      });
      placeholder.append(button);
    } else if (/^data:image\/(png|jpeg|gif|webp);base64,/i.test(src)) {
      const image = new Image(); image.alt = alt; image.src = src; image.loading = 'lazy'; placeholder.append(image);
    } else placeholder.textContent = `Image: ${alt || src || 'unavailable'} — local image attachments are not included in Markdown files.`;
    img.replaceWith(placeholder);
  });
  container.querySelectorAll('table').forEach(table => {
    const wrapper = document.createElement('div'); wrapper.className = 'table-scroll'; wrapper.tabIndex = 0;
    wrapper.setAttribute('role', 'region'); wrapper.setAttribute('aria-label', 'Scrollable table');
    table.before(wrapper); wrapper.append(table);
  });
  container.querySelectorAll('pre > code').forEach(code => {
    const source = code.textContent;
    const language = code.className.replace('language-', '').split(' ')[0];
    const pre = code.parentElement;
    const frame = document.createElement('figure');
    frame.className = language === 'mermaid' ? 'diagram-block' : 'code-block';
    const bar = document.createElement('figcaption'); bar.className = 'block-bar';
    const name = document.createElement('span'); name.textContent = language === 'mermaid' ? 'MERMAID · DIAGRAM' : (language || 'plain text').toUpperCase();
    bar.append(name);
    const actions = document.createElement('div');
    const copy = document.createElement('button'); copy.type = 'button'; copy.dataset.copy = source; copy.textContent = 'Copy'; copy.setAttribute('aria-label', language === 'mermaid' ? 'Copy diagram source' : 'Copy code'); actions.append(copy);
    if (language === 'mermaid') {
      frame.dataset.mermaid = source;
      const expand = document.createElement('button'); expand.type = 'button'; expand.textContent = 'Expand'; expand.dataset.expandDiagram = ''; expand.setAttribute('aria-label', 'Expand diagram'); actions.append(expand);
      const canvas = document.createElement('div'); canvas.className = 'diagram-canvas'; canvas.setAttribute('aria-label', 'Mermaid diagram'); canvas.setAttribute('role', 'img');
      canvas.textContent = 'Rendering diagram…';
      bar.append(actions); frame.append(bar, canvas);
    } else {
      if (hljs.getLanguage(language)) {
        try { code.innerHTML = hljs.highlight(source, { language }).value; } catch { code.textContent = source; }
      }
      code.classList.add('hljs');
      const wrap = document.createElement('button'); wrap.type = 'button'; wrap.textContent = 'Wrap'; wrap.dataset.wrapCode = ''; wrap.setAttribute('aria-pressed', 'false'); wrap.setAttribute('aria-label', 'Wrap code lines'); actions.prepend(wrap);
      bar.append(actions); pre.tabIndex = 0; frame.append(bar, pre.cloneNode(true));
    }
    pre.replaceWith(frame);
  });
  return headings.filter(h => h.tagName !== 'H1');
}

export function renderDiagrams(container, theme = 'light') {
  const blocks = [...container.querySelectorAll('[data-mermaid]')];
  if (!blocks.length) return Promise.resolve();
  // Serialize theme changes and document switches; Mermaid has global renderer state.
  diagramQueue = diagramQueue.catch(() => {}).then(async () => {
    const { default: mermaid } = await import('mermaid');
    mermaid.initialize({ startOnLoad: false, securityLevel: 'strict', suppressErrorRendering: true, maxTextSize: 50000, htmlLabels: false, theme: 'base',
      secure: ['securityLevel', 'startOnLoad', 'maxTextSize', 'maxEdges', 'suppressErrorRendering', 'htmlLabels', 'theme', 'themeCSS', 'themeVariables', 'fontFamily', 'flowchart'],
      themeVariables: theme === 'dark' ? {
        primaryColor: '#26374c', primaryTextColor: '#e0e6f0', primaryBorderColor: '#728db0', lineColor: '#91a6c4', secondaryColor: '#1a2738', tertiaryColor: '#202d40', fontFamily: 'DM Sans, sans-serif',
      } : {
        primaryColor: '#edf1f8', primaryTextColor: '#2d4567', primaryBorderColor: '#9cacc2', lineColor: '#778dab', secondaryColor: '#e6edf4', tertiaryColor: '#f5f7fb', fontFamily: 'DM Sans, sans-serif',
      }, flowchart: { htmlLabels: false, useMaxWidth: true }, sequence: { useMaxWidth: true },
    });
    for (const block of blocks) {
      if (!block.isConnected) continue;
      const canvas = block.querySelector('.diagram-canvas');
      try {
        const { svg } = await mermaid.render(`folio-diagram-${++diagramSequence}`, block.dataset.mermaid);
        if (block.isConnected) {
          canvas.innerHTML = DOMPurify.sanitize(svg, { USE_PROFILES: { svg: true, svgFilters: true } });
          const description = canvas.querySelector('title')?.textContent || [...new Set([...canvas.querySelectorAll('text')].map(text => text.textContent))].join('; ').slice(0, 700);
          canvas.setAttribute('aria-label', description ? `Diagram: ${description}` : 'Mermaid diagram');
        }
      } catch {
        canvas.replaceChildren();
        const message = document.createElement('p'); message.className = 'render-error'; message.textContent = 'This diagram could not be rendered. Check its Mermaid syntax; the source is preserved below.';
        const pre = document.createElement('pre'); pre.textContent = block.dataset.mermaid;
        canvas.append(message, pre);
      }
    }
  });
  return diagramQueue;
}
