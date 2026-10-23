import { test } from "node:test";
import assert from "node:assert/strict";
import { calcularAvisos, montarMensagem, idFixa, diaNoMes } from "./regras.mjs";

const hoje = "2026-10-22";
const g = (id, venc, extra = {}) => ({ id, desc: "Conta " + id, valor: 100, cat: "Contas", data: venc, venc, pago: false, ...extra });

test("avisa 3 dias antes, no dia e no dia seguinte; ignora pagos e entradas", () => {
  const itens = calcularAvisos([
    g(1, "2026-10-25"), g(2, "2026-10-22"), g(3, "2026-10-21"),
    g(4, "2026-10-23"), g(5, "2026-10-20"),                 // 1 dia antes e 2 dias atrasada: não avisa
    g(6, "2026-10-22", { pago: true }), g(7, "2026-10-22", { tipo: "entrada" }),
    { id: 8, desc: "Antigo", valor: 1, venc: "2026-10-22" }, // formato antigo sem "pago": considerado pago
  ], [], hoje);
  assert.deepEqual(itens.map(i => [i.desc, i.dias]), [["Conta 3", -1], ["Conta 2", 0], ["Conta 1", 3]]);
});

test("conta fixa ainda não lançada pelo app também avisa; lançada/paga não duplica", () => {
  const f = { id: 1793000000123, tipo: "gasto", desc: "Aluguel", valor: 1500, dia: 25, inicio: "2026-01", pulados: [] };
  assert.deepEqual(calcularAvisos([], [f], hoje).map(i => [i.desc, i.venc, i.dias]), [["Aluguel", "2026-10-25", 3]]);
  const lancada = { id: idFixa(f, "2026-10"), fixa: f.id, desc: "Aluguel", valor: 1500, data: "2026-10-25", venc: "2026-10-25", pago: true };
  assert.equal(calcularAvisos([lancada], [f], hoje).length, 0);
  assert.equal(calcularAvisos([], [{ ...f, pulados: ["2026-10"] }], hoje).length, 0);
  assert.equal(calcularAvisos([], [{ ...f, fim: "2026-09" }], hoje).length, 0);
  assert.equal(calcularAvisos([], [{ ...f, tipo: "entrada" }], hoje).length, 0);
});

test("conta fixa no dia 31 cai no último dia do mês", () => {
  assert.equal(diaNoMes("2026-02", 31), "2026-02-28");
  const f = { id: 5, desc: "Escola", valor: 800, dia: 31, inicio: "2026-01" };
  assert.deepEqual(calcularAvisos([], [f], "2026-02-28").map(i => i.dias), [0]);
});

test("virada de mês: vence dia 1 do mês seguinte, avisa 3 dias antes", () => {
  const f = { id: 9, desc: "Condomínio", valor: 600, dia: 1, inicio: "2026-01" };
  assert.deepEqual(calcularAvisos([], [f], "2026-10-29").map(i => i.venc), ["2026-11-01"]);
});

test("mensagem", () => {
  assert.equal(montarMensagem([]), null);
  const um = montarMensagem([{ desc: "Luz", valor: 210.35, venc: hoje, dias: 0 }]);
  assert.equal(um.titulo, "Conta vence hoje");
  assert.match(um.corpo, /^Luz: R\$\s210,35$/);
  const varios = montarMensagem([{ desc: "Aluguel", valor: 1500, dias: -1 }, { desc: "Luz", valor: 210, dias: 0 }]);
  assert.equal(varios.titulo, "2 contas para pagar (1 atrasada)");
  assert.match(varios.corpo, /Venceu ontem: Aluguel/);
  assert.match(varios.corpo, /Total: R\$\s1\.710,00/);
});
