// Grava no index.html os números do topo e a descrição da prévia de link,
// pra eles existirem sem JavaScript (prévia do Telegram, Google).
// Roda sozinho no GitHub Actions toda vez que o apostas.json muda.
const fs = require("fs");
const html = fs.readFileSync("index.html", "utf8");
const dados = JSON.parse(fs.readFileSync("apostas.json", "utf8"));
const ini = html.indexOf("var HISTORICO = "), fim = html.indexOf("\n  };", ini);
const HISTORICO = eval("(" + html.slice(ini + 16, fim + 4).trim().replace(/;$/, "") + ")");

const fmt = (n, d) => n.toLocaleString("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d });
const sinal = (n, d) => (n > 0 ? "+" : n < 0 ? "−" : "") + fmt(Math.abs(n), d);
const lucro = a => a[5] === "GREEN" ? a[3] * (a[4] - 1) : a[5] === "RED" ? -a[3] : 0;
const res = l => (l || []).filter(a => ["GREEN", "RED", "VOID"].includes(a[5]));
const porMes = l => { const m = {}; res(l).forEach(a => { const k = a[0].slice(0, 7); m[k] = m[k] || [0, 0]; m[k][0] += lucro(a); m[k][1] += +a[3]; }); return m; };

const servicos = [HISTORICO.props.meses, HISTORICO.nba.meses, porMes(dados.apostas), porMes(dados.gringa)];
let totPl = 0; const cal = {};
servicos.forEach(m => Object.keys(m).forEach(k => { totPl += m[k][0]; cal[k] = (cal[k] || 0) + m[k][0]; }));
const mesAtual = new Date().toISOString().slice(0, 7);
const fechados = Object.keys(cal).filter(k => k < mesAtual), mesesPos = fechados.filter(k => cal[k] > 0).length;
const nServ = servicos.filter(m => Object.keys(m).length).length;
const vivos = res(dados.apostas).concat(res(dados.gringa));
let vPl = 0, vUn = 0; vivos.forEach(a => { vPl += lucro(a); vUn += +a[3]; });
const roi = vUn ? sinal(vPl / vUn * 100, 1) : "0";

const fatos = [
  [sinal(vPl, 1) + "u", `grupos ativos desde out/26 · ROI ${roi}% em ${fmt(vivos.length, 0)} apostas`, vPl >= 0],
  [sinal(totPl, 0) + "u", `desde abril, somando os ${nServ} serviços`, totPl >= 0],
  [`${mesesPos} de ${fechados.length}`, "meses fechados no lucro", false],
].map(f => `<div class="fact"><b class="num${f[2] ? " pos" : ""}">${f[0]}</b><span>${f[1]}</span></div>`).join("");

const desc = `Grupos ativos: ${sinal(vPl, 1)}u, ROI ${roi}% em ${fmt(vivos.length, 0)} apostas. Desde abril: ${sinal(totPl, 0)}u somando ${nServ} serviços, ${mesesPos} de ${fechados.length} meses fechados no lucro. Planilhas abertas, green ou red.`;

let out = html.replace(/<!--fatos-->[\s\S]*?<!--\/fatos-->/, `<!--fatos-->${fatos}<!--/fatos-->`)
  .replace(/(<meta name="description" content=")[^"]*(")/, `$1${desc}$2`)
  .replace(/(<meta property="og:description" content=")[^"]*(")/, `$1${desc}$2`);
if (!/twitter:description/.test(out)) out = out.replace('<meta name="twitter:site"', `<meta name="twitter:description" content="${desc}">\n<meta name="twitter:site"`);
else out = out.replace(/(<meta name="twitter:description" content=")[^"]*(")/, `$1${desc}$2`);
if (out !== html) { fs.writeFileSync("index.html", out); console.log("index.html atualizado: " + desc); }
else console.log("sem mudança");
