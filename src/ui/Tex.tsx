/**
 * Tex.tsx — 极简 LaTeX 子集 → 浏览器原生 MathML（零依赖）
 *
 * 支持的写法：\frac \dfrac \sqrt \left \right \text，^ _ 上下标，
 * 希腊字母（\alpha…）、运算符（\cdot \times \ge \le \sum …）、正体函数名（\cos \sin \arcsin…）。
 * 目标：把公式排成真正的数学式（分式、上下标），而不是用 "/" 的纯文本。
 */
const GREEK: Record<string, string> = {
  alpha: 'α', beta: 'β', gamma: 'γ', delta: 'δ', epsilon: 'ε', zeta: 'ζ', eta: 'η',
  theta: 'θ', iota: 'ι', kappa: 'κ', lambda: 'λ', mu: 'μ', nu: 'ν', xi: 'ξ', pi: 'π',
  rho: 'ρ', sigma: 'σ', tau: 'τ', phi: 'φ', chi: 'χ', psi: 'ψ', omega: 'ω',
  Gamma: 'Γ', Delta: 'Δ', Theta: 'Θ', Lambda: 'Λ', Xi: 'Ξ', Pi: 'Π', Sigma: 'Σ',
  Phi: 'Φ', Psi: 'Ψ', Omega: 'Ω',
}
const OPS: Record<string, string> = {
  cdot: '⋅', times: '×', ge: '≥', le: '≤', approx: '≈', pm: '±', to: '→',
  circ: '∘', sum: '∑', int: '∫', in: '∈', neq: '≠', ldots: '…', dots: '…',
}
const FN = new Set(['cos', 'sin', 'tan', 'cot', 'sec', 'csc', 'arcsin', 'arccos', 'arctan', 'exp', 'ln', 'log', 'min', 'max'])
const DELIM: Record<string, string> = { '{': '{', '}': '}', '|': '|', '.': '' }

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

type Tok = { t: 'cmd' | 'char' | 'lbrace' | 'rbrace' | 'sub' | 'sup' | 'text'; v: string }

function tokenize(src: string): Tok[] {
  const out: Tok[] = []
  let i = 0
  while (i < src.length) {
    const ch = src[i]
    if (ch === ' ' || ch === '\n' || ch === '\t') {
      i++
      continue
    }
    if (ch === '{') {
      out.push({ t: 'lbrace', v: '' })
    } else if (ch === '}') {
      out.push({ t: 'rbrace', v: '' })
    } else if (ch === '^') {
      out.push({ t: 'sup', v: '' })
    } else if (ch === '_') {
      out.push({ t: 'sub', v: '' })
    } else if (ch === '\\') {
      i++
      let name = ''
      while (i < src.length && /[a-zA-Z]/.test(src[i])) {
        name += src[i]
        i++
      }
      if (name === '') {
        name = src[i] ?? ''
        i++
      }
      if ((name === 'text' || name === 'mathrm' || name === 'operatorname') && src[i] === '{') {
        i++
        let depth = 1
        let buf = ''
        while (i < src.length && depth > 0) {
          const c = src[i]
          if (c === '{') depth++
          else if (c === '}') {
            depth--
            if (depth === 0) {
              i++
              break
            }
          }
          buf += c
          i++
        }
        out.push({ t: 'text', v: buf })
      } else {
        out.push({ t: 'cmd', v: name })
      }
      continue
    } else {
      out.push({ t: 'char', v: ch })
    }
    i++
  }
  return out
}

const isRight = (tk: Tok | undefined) => !!tk && tk.t === 'cmd' && tk.v === 'right'

function delimOf(tk: Tok | undefined): string {
  if (!tk) return ''
  if (tk.t === 'char') return tk.v
  if (tk.t === 'cmd') return DELIM[tk.v] ?? ''
  return ''
}

function parseSeq(toks: Tok[], i: number, stopAtRight = false): { html: string; i: number } {
  let html = ''
  while (i < toks.length && toks[i].t !== 'rbrace' && !(stopAtRight && isRight(toks[i]))) {
    const r = parseAtom(toks, i)
    html += r.html
    i = r.i
  }
  return { html, i }
}

function parseGroup(toks: Tok[], i: number): { html: string; i: number } {
  if (toks[i] && toks[i].t === 'lbrace') {
    const r = parseSeq(toks, i + 1)
    let j = r.i
    if (toks[j] && toks[j].t === 'rbrace') j++
    return { html: `<mrow>${r.html}</mrow>`, i: j }
  }
  return parseAtom(toks, i)
}

function parseAtom(toks: Tok[], i: number): { html: string; i: number } {
  const tk = toks[i]
  let base = ''

  if (!tk) return { html: '', i: i + 1 }

  if (tk.t === 'lbrace') {
    const r = parseSeq(toks, i + 1)
    let j = r.i
    if (toks[j] && toks[j].t === 'rbrace') j++
    base = `<mrow>${r.html}</mrow>`
    i = j
  } else if (tk.t === 'text') {
    base = `<mtext>${esc(tk.v)}</mtext>`
    i++
  } else if (tk.t === 'cmd') {
    const c = tk.v
    if (c === 'frac' || c === 'dfrac') {
      const a = parseGroup(toks, i + 1)
      const b = parseGroup(toks, a.i)
      base = `<mfrac>${a.html}${b.html}</mfrac>`
      i = b.i
    } else if (c === 'sqrt') {
      const a = parseGroup(toks, i + 1)
      base = `<msqrt>${a.html}</msqrt>`
      i = a.i
    } else if (c === 'left') {
      // \left( … \right) 成对包进同一个 mrow：两侧括号随内容一起拉伸，上标挂在整组外面
      const open = delimOf(toks[i + 1])
      const inner = parseSeq(toks, i + 2, true)
      let j = inner.i
      let close = ''
      if (isRight(toks[j])) {
        close = delimOf(toks[j + 1])
        j += 2
      }
      const fence = (d: string) => (d ? `<mo fence="true" stretchy="true" symmetric="true">${esc(d)}</mo>` : '')
      base = `<mrow>${fence(open)}${inner.html}${fence(close)}</mrow>`
      i = j
    } else if (c === 'right') {
      // 孤立的 \right：按普通定界符处理
      base = `<mo>${esc(delimOf(toks[i + 1]))}</mo>`
      i += 2
    } else if (OPS[c] !== undefined) {
      base = `<mo>${esc(OPS[c])}</mo>`
      i++
    } else if (FN.has(c)) {
      base = `<mi mathvariant="normal">${esc(c)}</mi>`
      i++
    } else if (GREEK[c] !== undefined) {
      base = `<mi>${esc(GREEK[c])}</mi>`
      i++
    } else if (c === 'quad') {
      base = '<mspace width="1em"/>'
      i++
    } else if (c === ',') {
      base = '<mspace width="0.17em"/>'
      i++
    } else if (c === ' ') {
      base = '<mspace width="0.3em"/>'
      i++
    } else if (DELIM[c] !== undefined) {
      base = `<mo>${esc(DELIM[c])}</mo>`
      i++
    } else {
      base = `<mi mathvariant="normal">${esc(c)}</mi>`
      i++
    }
  } else if (tk.t === 'char') {
    const ch = tk.v
    if (/[0-9]/.test(ch)) {
      let run = ch
      while (toks[i + 1] && toks[i + 1].t === 'char' && /[0-9.]/.test(toks[i + 1].v)) {
        run += toks[i + 1].v
        i++
      }
      base = `<mn>${esc(run)}</mn>`
      i++
    } else if (/[a-zA-Z]/.test(ch)) {
      let run = ch
      while (toks[i + 1] && toks[i + 1].t === 'char' && /[a-zA-Z]/.test(toks[i + 1].v)) {
        run += toks[i + 1].v
        i++
      }
      base = run.length === 1 ? `<mi>${esc(run)}</mi>` : `<mi mathvariant="normal">${esc(run)}</mi>`
      i++
    } else {
      base = `<mo>${esc(ch)}</mo>`
      i++
    }
  } else {
    // 孤立的 ^/_：忽略脚本标记本身
    base = ''
    i++
  }

  let sub: string | null = null
  let sup: string | null = null
  while (toks[i] && (toks[i].t === 'sub' || toks[i].t === 'sup')) {
    const kind = toks[i].t
    const r = parseGroup(toks, i + 1)
    if (kind === 'sub') sub = r.html
    else sup = r.html
    i = r.i
  }
  if (sub !== null && sup !== null) base = `<msubsup>${base}${sub}${sup}</msubsup>`
  else if (sub !== null) base = `<msub>${base}${sub}</msub>`
  else if (sup !== null) base = `<msup>${base}${sup}</msup>`

  return { html: base, i }
}

export function renderTex(src: string, block = false): string {
  const toks = tokenize(src)
  const { html } = parseSeq(toks, 0)
  // displaystyle：分式按“展示样式”渲染（分子分母全尺寸，下标不再被二次缩小）
  return `<math xmlns="http://www.w3.org/1998/Math/MathML" display="${block ? 'block' : 'inline'}" displaystyle="true"><mstyle displaystyle="true">${html}</mstyle></math>`
}

export function Tex({ src, block }: { src: string; block?: boolean }) {
  return <span className="tex" dangerouslySetInnerHTML={{ __html: renderTex(src, block) }} />
}
