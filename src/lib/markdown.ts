/**
 * Messages from Keston are written in a small, safe Markdown subset:
 * paragraphs, ## headings, - lists, 1. lists, **bold**, *italic*, `code` and
 * [links](https://…) (http, https and mailto only). Everything else is shown
 * as text. All input is HTML-escaped first, so raw HTML never reaches the
 * page; only tags this file writes are in the output.
 */
const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')

function inline(text: string): string {
  const codes: string[] = []
  // Pull code spans out first so their contents stay literal.
  let out = escapeHtml(text).replace(/`([^`]+)`/g, (_, c: string) => {
    codes.push(`<code>${c}</code>`)
    return `\u0000${codes.length - 1}\u0000`
  })
  out = out.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (m, label: string, href: string) => {
    // href is already escaped (&amp; etc.), which is what an attribute needs.
    return /^(https?:\/\/|mailto:)/i.test(href) ? `<a href="${href}" target="_blank" rel="noopener noreferrer">${label}</a>` : m
  })
  out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>').replace(/(^|[^*])\*([^*\s][^*]*)\*/g, '$1<em>$2</em>')
  // eslint-disable-next-line no-control-regex
  return out.replace(/\u0000(\d+)\u0000/g, (_, i: string) => codes[Number(i)] ?? '')
}

export function renderMarkdown(source: string): string {
  const blocks = source.replace(/\r\n?/g, '\n').trim().split(/\n{2,}/)
  const html: string[] = []
  for (const block of blocks) {
    const lines = block.split('\n')
    if (lines.every((l) => /^\s*[-*]\s+/.test(l))) {
      html.push(`<ul>${lines.map((l) => `<li>${inline(l.replace(/^\s*[-*]\s+/, ''))}</li>`).join('')}</ul>`)
    } else if (lines.every((l) => /^\s*\d+[.)]\s+/.test(l))) {
      html.push(`<ol>${lines.map((l) => `<li>${inline(l.replace(/^\s*\d+[.)]\s+/, ''))}</li>`).join('')}</ol>`)
    } else if (/^#{1,3}\s+/.test(block)) {
      html.push(`<h3>${inline(block.replace(/^#{1,3}\s+/, '').replace(/\n/g, ' '))}</h3>`)
    } else {
      html.push(`<p>${lines.map(inline).join('<br>')}</p>`)
    }
  }
  return html.join('')
}
