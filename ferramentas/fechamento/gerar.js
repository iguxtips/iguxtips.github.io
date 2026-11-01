// Fechamento do mês — gera os cards (Telegram 1080x1350 e X 1600x900) e os textos.
// Uso: node ferramentas/fechamento/gerar.js [AAAA-MM] [pasta_saida]
// Sem mês: usa o mês anterior (fuso de Brasília). Lê apostas.json do site.
// Soma Poly++, NBA Gringa e NBA Big Odds (Botigux fica de fora).
const fs = require('fs'), path = require('path');
const { chromium } = require('playwright');
const RAIZ = path.resolve(__dirname, '..', '..');

const agoraSP = new Date(Date.now() - 3 * 3600000);
const mesPadrao = (() => { const d = new Date(Date.UTC(agoraSP.getUTCFullYear(), agoraSP.getUTCMonth() - 1, 1)); return d.toISOString().slice(0, 7); })();
const MES = process.argv[2] || mesPadrao;
const SAIDA = path.resolve(process.argv[3] || path.join(process.cwd(), 'fechamento-' + MES));
fs.mkdirSync(SAIDA, { recursive: true });

const NOMES_MES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const nf = (x, d) => Number(x).toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d });
const sinal = (x, d) => (x > 0 ? '+' : x < 0 ? '−' : '') + nf(Math.abs(x), d);
const lp = (u, o, r) => ({ GREEN: u * (o - 1), RED: -u, VOID: 0, HGREEN: u * (o - 1) / 2, HRED: -u / 2 })[r] || 0;

const dados = JSON.parse(fs.readFileSync(path.join(RAIZ, 'apostas.json'), 'utf8'));
const SERV = [['apostas', 'Poly++'], ['gringa', 'NBA Gringa'], ['odds', 'NBA Big Odds']];
const todas = [], porServ = [];
SERV.forEach(([k, nome]) => {
  const rows = (dados[k] || []).filter(r => String(r[0]).startsWith(MES) && ['GREEN', 'RED', 'VOID', 'HGREEN', 'HRED'].includes(r[5]));
  if (!rows.length) return;
  const u = rows.reduce((s, r) => s + r[3], 0), l = rows.reduce((s, r) => s + lp(r[3], r[4], r[5]), 0);
  porServ.push({ nome, n: rows.length, u, lucro: l, roi: u ? l / u : 0 });
  rows.forEach(r => todas.push({ serv: nome, d: r[0], quem: r[1], aposta: r[2], u: r[3], o: r[4], r: r[5], esp: r[7] || '', lp: lp(r[3], r[4], r[5]) }));
});
if (!todas.length) { console.error('Sem apostas resolvidas em ' + MES); process.exit(1); }

const U = todas.reduce((s, a) => s + a.u, 0), L = todas.reduce((s, a) => s + a.lp, 0);
const G = todas.filter(a => a.r === 'GREEN' || a.r === 'HGREEN').length, R = todas.filter(a => a.r === 'RED' || a.r === 'HRED').length;
const porDia = {};
todas.forEach(a => { porDia[a.d] = (porDia[a.d] || 0) + a.lp; });
const dias = Object.keys(porDia).sort();
let acc = 0; const curva = [0].concat(dias.map(d => (acc += porDia[d])));
const melhorDia = dias.reduce((b, d) => porDia[d] > porDia[b] ? d : b, dias[0]);
const porEsp = {};
todas.forEach(a => { if (a.esp) porEsp[a.esp] = (porEsp[a.esp] || 0) + a.lp; });
const melhorEsp = Object.keys(porEsp).sort((a, b) => porEsp[b] - porEsp[a])[0];
const greens = todas.filter(a => a.r === 'GREEN' && a.o <= 20);
const maiorGreen = greens.sort((a, b) => b.o - a.o)[0];
const diasPos = dias.filter(d => porDia[d] > 0).length;

const [ano, mm] = MES.split('-');
const nomeMes = NOMES_MES[Number(mm) - 1];
const ddmm = iso => iso.slice(8, 10) + '/' + iso.slice(5, 7);
const S = {
  mes: nomeMes, ano, lucro: sinal(L, 2) + 'u', pos: L >= 0, roi: sinal(L / U * 100, 1) + '%', n: todas.length,
  acerto: nf(G / (G + R) * 100, 0) + '%', unidades: nf(U, 0),
  destaques: [
    { t: 'Melhor dia', v: sinal(porDia[melhorDia], 1) + 'u', s: ddmm(melhorDia) },
    melhorEsp ? { t: 'Destaque', v: sinal(porEsp[melhorEsp], 1) + 'u', s: melhorEsp } : null,
    maiorGreen ? { t: 'Maior green', v: '@' + nf(maiorGreen.o, 2), s: maiorGreen.quem.split(' ').slice(-1)[0] } : { t: 'Dias no azul', v: diasPos + '/' + dias.length, s: 'dias' },
  ].filter(Boolean),
  servicos: porServ.map(s => ({ nome: s.nome, v: sinal(s.lucro, 2) + 'u', pos: s.lucro >= 0 })),
  curva,
};

function html(W, H) {
  const vert = H > W;
  const cw = vert ? 936 : 720, ch = vert ? 190 : 150, P = 6;
  const mn = Math.min(...S.curva), mx = Math.max(...S.curva), rg = (mx - mn) || 1;
  const x = i => P + i * (cw - 2 * P) / (S.curva.length - 1), y = v => P + (mx - v) * (ch - 2 * P) / rg;
  const linha = S.curva.map((v, i) => (i ? 'L' : 'M') + x(i).toFixed(1) + ' ' + y(v).toFixed(1)).join(' ');
  const area = linha + ` L${x(S.curva.length - 1).toFixed(1)} ${ch} L${x(0).toFixed(1)} ${ch} Z`;
  const cor = S.pos ? '#3fd68a' : '#ff6b63';
  const f = n => `url(../../fonts/${n}.woff2) format("woff2")`;
  return `<!doctype html><html><head><meta charset="utf-8"><style>
@font-face{font-family:B;font-style:italic;font-weight:800;src:${f('barlow-condensed-latin-800-italic')}}
@font-face{font-family:B;font-style:italic;font-weight:700;src:${f('barlow-condensed-latin-700-italic')}}
@font-face{font-family:B;font-style:normal;font-weight:700;src:${f('barlow-condensed-latin-700-normal')}}
@font-face{font-family:P;font-weight:500;src:${f('ibm-plex-sans-latin-500-normal')}}
@font-face{font-family:P;font-weight:600;src:${f('ibm-plex-sans-latin-600-normal')}}
@font-face{font-family:M;font-weight:500;src:${f('ibm-plex-mono-latin-500-normal')}}
*{box-sizing:border-box;margin:0;padding:0}
body{width:${W}px;height:${H}px;background:#040817;color:#eef2ff;font-family:P;overflow:hidden;position:relative}
.arte{position:absolute;${vert ? 'left:0;top:0;width:100%;height:620px;background:url(../../img/igux-capa.jpg) 100% 0/auto 1100px no-repeat' : 'right:0;top:0;width:1000px;height:100%;background:url(../../img/igux-capa.jpg) 88% 30%/auto 1060px no-repeat'}}
.veu{position:absolute;inset:0;background:${vert ? 'linear-gradient(90deg,rgba(4,8,23,.85) 0,rgba(4,8,23,.2) 45%,rgba(4,8,23,0) 100%),linear-gradient(180deg,rgba(4,8,23,0) 0,rgba(4,8,23,.35) 300px,#040817 600px)' : 'linear-gradient(90deg,#040817 0,#040817 640px,rgba(4,8,23,.55) 900px,rgba(4,8,23,.15) 1300px,rgba(4,8,23,.35) 100%)'}}
.grao{position:absolute;inset:0;opacity:.08;background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.85' numOctaves='3'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")}
.c{position:absolute;${vert ? 'left:72px;right:72px;top:96px' : 'left:84px;top:70px;width:760px'}}
.logo{display:flex;align-items:flex-end;gap:3px;font:italic 800 ${vert ? 46 : 40}px/1 B;letter-spacing:.02em}
.logo svg{width:22px;height:16px;color:#2c5cff;margin:0 3px ${vert ? 28 : 24}px 0}
.k{margin-top:${vert ? 0 : 26}px;font:italic 700 ${vert ? 40 : 36}px/1 B;color:#9db3ff;text-transform:uppercase;letter-spacing:.02em}
.hero{font:italic 800 ${vert ? 220 : 186}px/.86 B;color:${cor};letter-spacing:-.01em;margin-top:${vert ? 10 : 12}px;text-shadow:0 10px 50px rgba(63,214,138,.18)}
.sub{margin-top:${vert ? 18 : 16}px;font:600 ${vert ? 30 : 26}px P;color:#c7d1de}
.sub b{color:#eef2ff;font-weight:600}
.graf{margin-top:${vert ? 26 : 20}px}
.dest{display:grid;grid-template-columns:repeat(${S.destaques.length},1fr);gap:0;margin-top:${vert ? 22 : 16}px;border-top:1px solid #26366b}
.dest div{border-left:2px solid #2c5cff;padding-left:16px;margin-top:${vert ? 18 : 14}px}
.dest i{display:block;font:500 ${vert ? 20 : 17}px M;color:#93a0c6;font-style:normal;text-transform:uppercase;letter-spacing:.06em}
.dest b{display:block;font:italic 800 ${vert ? 58 : 50}px/1.05 B}
.dest span{font:500 ${vert ? 22 : 19}px P;color:#93a0c6}
.serv{display:flex;flex-wrap:wrap;gap:8px 26px;font:500 ${vert ? 22 : 19}px M;color:#93a0c6}
.serv b{font-weight:500;color:#eef2ff}.serv .p{color:#3fd68a}.serv .n{color:#ff6b63}
.base{position:absolute;${vert ? 'left:72px;right:72px;bottom:48px' : 'left:84px;width:760px;bottom:42px'};display:grid;gap:${vert ? 18 : 12}px}
.rod{display:flex;justify-content:space-between;font:500 ${vert ? 21 : 17}px M;color:#7884aa;border-top:1px solid #18244a;padding-top:${vert ? 16 : 12}px}
.rod b{color:#eef2ff;font-weight:500}
</style></head><body>
<div class="arte"></div><div class="veu"></div><div class="grao"></div>
<div class="c">
  <div class="logo"><svg viewBox="0 0 16 12"><path fill="currentColor" d="M0 12 1.5 2l4 4L8 0l2.5 6 4-4L16 12z"/></svg>IGUX</div>
  ${vert ? '<div style="height:330px"></div>' : ''}<div class="k">Fechamento · ${S.mes} ${S.ano}</div>
  <div class="hero">${S.lucro}</div>
  <div class="sub">ROI <b>${S.roi}</b> · <b>${S.n}</b> apostas · <b>${S.acerto}</b> de acerto</div>
  <svg class="graf" width="${cw}" height="${ch}" viewBox="0 0 ${cw} ${ch}">
    <defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${cor}" stop-opacity=".28"/><stop offset="1" stop-color="${cor}" stop-opacity="0"/></linearGradient></defs>
    <line x1="${P}" x2="${cw - P}" y1="${y(0)}" y2="${y(0)}" stroke="#26366b" stroke-width="2" stroke-dasharray="6 8"/>
    <path d="${area}" fill="url(#g)"/><path d="${linha}" fill="none" stroke="${cor}" stroke-width="5" stroke-linejoin="round" stroke-linecap="round"/>
    <circle cx="${x(S.curva.length - 1)}" cy="${y(S.curva[S.curva.length - 1])}" r="9" fill="${cor}"/>
  </svg>
  <div class="dest">${S.destaques.map(d => `<div><i>${d.t}</i><b>${d.v}</b><span>${d.s}</span></div>`).join('')}</div>
</div>
<div class="base">
  <div class="serv">${S.servicos.map(s => `<span>${s.nome} <b class="${s.pos ? 'p' : 'n'}">${s.v}</b></span>`).join('')}</div>
  <div class="rod"><span><b>@iguxTips</b> · iguxtips.github.io</span><span>+18 · resultados em unidades</span></div>
</div>
</body></html>`;
}

(async () => {
  const b = await chromium.launch();
  for (const [W, H, nome] of [[1080, 1350, 'telegram'], [1600, 900, 'x']]) {
    const arq = path.join(__dirname, '_card_' + nome + '.html');
    fs.writeFileSync(arq, html(W, H));
    const p = await b.newPage({ viewport: { width: W, height: H } });
    await p.goto('file://' + arq);
    await p.evaluate(() => document.fonts.ready);
    await p.waitForTimeout(300);
    await p.screenshot({ path: path.join(SAIDA, `fechamento-${MES}-${nome}.png`) });
    fs.unlinkSync(arq);
  }
  await b.close();

  const dest = S.destaques.map(d => `${d.t}: ${d.v} (${d.s})`);
  const tX = `Fechamento de ${S.mes} ✅\n\n${S.lucro} | ROI ${S.roi}\n${S.n} apostas · ${S.acerto} de acerto\n\n${S.servicos.map(s => `${s.nome}: ${s.v}`).join('\n')}\n\nTudo registrado em planilha aberta 👇\niguxtips.github.io`;
  const tTg = `📊 **FECHAMENTO DE ${S.mes.toUpperCase()} ${S.ano}**\n\n💰 **${S.lucro}** · ROI **${S.roi}**\n🎯 ${S.n} apostas · ${S.acerto} de acerto · ${S.unidades}u apostadas\n\n${S.servicos.map(s => `• ${s.nome}: **${s.v}**`).join('\n')}\n\n🔥 ${dest.join('\n🔥 ')}\n\nTodos os resultados, aposta por aposta, ficam abertos no site e nas planilhas 👉 iguxtips.github.io\n\n+18 · Aposte com responsabilidade.`;
  fs.writeFileSync(path.join(SAIDA, `fechamento-${MES}-textos.txt`), `=== X (${tX.length} caracteres) ===\n${tX}\n\n=== TELEGRAM (os ** viram negrito quando você cola e envia no Telegram) ===\n${tTg}\n`);
  console.log(JSON.stringify({ mes: MES, saida: SAIDA, lucro: S.lucro, roi: S.roi, n: S.n, caracteresX: tX.length }));
})();
