// Regras dos avisos de vencimento (sem Firebase, para poder testar).
// Avisa 3 dias antes, no dia e no dia seguinte ao vencimento, enquanto não estiver pago.
export const DIAS_AVISO = { 3: "Em 3 dias", 0: "Hoje", [-1]: "Venceu ontem" };

const brl = n => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export function somaDias(iso, n) {
  const d = new Date(iso + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
export const diasEntre = (de, ate) => Math.round((new Date(ate + "T12:00:00Z") - new Date(de + "T12:00:00Z")) / 86400000);
export const somaMes = (ym, n) => {
  const [a, m] = ym.split("-").map(Number);
  const d = new Date(Date.UTC(a, m - 1 + n, 1));
  return d.toISOString().slice(0, 7);
};
// Iguais aos do app (index.html): dia da conta fixa no mês e id do lançamento gerado.
export const diaNoMes = (ym, dia) =>
  `${ym}-${String(Math.min(dia, new Date(Date.UTC(+ym.slice(0, 4), +ym.slice(5, 7), 0)).getUTCDate())).padStart(2, "0")}`;
export const idFixa = (f, ym) => Number(ym.replace("-", "")) * 1e7 + (f.id % 1e7);

// gastos: lançamentos com vencimento perto de hoje; fixas: contas fixas da pessoa.
// Retorna os itens a avisar hoje, cada um com { desc, valor, venc, dias }.
export function calcularAvisos(gastos, fixas, hoje) {
  const itens = [];
  const avisar = dias => dias in DIAS_AVISO;
  const existentes = new Set(gastos.map(g => g.id));
  for (const g of gastos) {
    if (g.tipo === "entrada" || g.pago !== false || !g.venc) continue;
    const dias = diasEntre(hoje, g.venc);
    if (avisar(dias)) itens.push({ desc: g.desc, valor: g.valor, venc: g.venc, dias });
  }
  // Contas fixas que o app ainda não lançou (a pessoa não abriu o app no mês).
  const mesAtual = hoje.slice(0, 7);
  for (const f of fixas || []) {
    if (f.tipo === "entrada") continue;
    for (const ym of [somaMes(mesAtual, -1), mesAtual, somaMes(mesAtual, 1)]) {
      if (ym < f.inicio || (f.fim && ym > f.fim) || (f.pulados || []).includes(ym)) continue;
      if (existentes.has(idFixa(f, ym)) || gastos.some(g => g.fixa === f.id && g.data?.startsWith(ym))) continue;
      const venc = diaNoMes(ym, f.dia), dias = diasEntre(hoje, venc);
      if (avisar(dias)) itens.push({ desc: f.desc, valor: f.valor, venc, dias });
    }
  }
  return itens.sort((a, b) => a.venc.localeCompare(b.venc));
}

export function montarMensagem(itens) {
  if (!itens.length) return null;
  const total = itens.reduce((s, i) => s + i.valor, 0);
  const atrasadas = itens.filter(i => i.dias < 0).length, hoje = itens.filter(i => i.dias === 0).length;
  const titulo = itens.length === 1
    ? (itens[0].dias < 0 ? "Conta venceu ontem" : itens[0].dias === 0 ? "Conta vence hoje" : "Conta vence em 3 dias")
    : atrasadas ? `${itens.length} contas para pagar (${atrasadas} atrasada${atrasadas > 1 ? "s" : ""})`
    : hoje ? `${itens.length} contas para pagar (${hoje} hoje)` : `${itens.length} contas vencem em breve`;
  const corpo = itens.length === 1
    ? `${itens[0].desc}: ${brl(itens[0].valor)}`
    : itens.map(i => `${DIAS_AVISO[i.dias]}: ${i.desc} ${brl(i.valor)}`).join("\n") + `\nTotal: ${brl(total)}`;
  return { titulo, corpo };
}
