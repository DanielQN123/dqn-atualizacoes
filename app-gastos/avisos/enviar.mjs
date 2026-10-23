// Roda uma vez por dia (GitHub Actions, .github/workflows/avisos-gastos.yml): para cada conta,
// procura contas a vencer e envia uma notificação para todos os aparelhos com avisos ativos.
//   FIREBASE_SERVICE_ACCOUNT  JSON da conta de serviço do Firebase (segredo do repositório)
//   APP_URL                   endereço do app, aberto ao tocar na notificação
//   SIMULAR=1                 só mostra o que seria enviado
import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getMessaging } from "firebase-admin/messaging";
import { calcularAvisos, montarMensagem, somaDias, somaMes, idFixa } from "./regras.mjs";

const credencial = process.env.FIREBASE_SERVICE_ACCOUNT;
if (!credencial) {
  console.log("FIREBASE_SERVICE_ACCOUNT não configurado: nenhum aviso enviado.");
  process.exit(0);
}
const simular = process.env.SIMULAR === "1";
const appUrl = process.env.APP_URL || "https://danielqn123.github.io/dqn-atualizacoes/app-gastos/";

initializeApp({ credential: cert(JSON.parse(credencial)) });
const db = getFirestore();
const messaging = getMessaging();

const hoje = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
console.log("Data de referência:", hoje);

let contas = 0, enviados = 0, falhas = 0;
// listDocuments também traz contas sem documento de perfil (só com gastos).
for (const conta of await db.collection("usuarios").listDocuments()) {
  contas++;
  const [perfil, gastosSnap, dispSnap] = await Promise.all([
    conta.get(),
    conta.collection("gastos").where("venc", ">=", somaDias(hoje, -1)).where("venc", "<=", somaDias(hoje, 3)).get(),
    conta.collection("dispositivos").get(),
  ]);
  if (dispSnap.empty) continue;
  // Também precisa dos lançamentos das contas fixas do mês (mesmo já pagos) para não avisar de novo.
  const fixas = perfil.data()?.fixas || [];
  const ids = [...new Set(fixas.flatMap(f => [-1, 0, 1].map(n => String(idFixa(f, somaMes(hoje.slice(0, 7), n))))))];
  const fixasDocs = ids.length ? await db.getAll(...ids.map(id => conta.collection("gastos").doc(id))) : [];
  const porId = new Map([...gastosSnap.docs, ...fixasDocs.filter(d => d.exists)].map(d => [d.id, d.data()]));
  const gastos = [...porId.values()];

  const msg = montarMensagem(calcularAvisos(gastos, fixas, hoje));
  if (!msg) continue;
  const tokens = dispSnap.docs.map(d => d.data().token).filter(Boolean);
  if (simular) { console.log(`[simulação] ${tokens.length} aparelho(s):`, msg); continue; }

  const r = await messaging.sendEachForMulticast({
    tokens,
    webpush: {
      headers: { Urgency: "high", TTL: String(20 * 3600) },
      data: { titulo: msg.titulo, corpo: msg.corpo, tag: "vencimentos-" + hoje, url: appUrl },
      fcmOptions: { link: appUrl },
    },
  });
  enviados += r.successCount;
  // Aparelhos que desinstalaram o app ou bloquearam os avisos: remove o token.
  await Promise.all(r.responses.map((res, i) => {
    if (res.success) return null;
    falhas++;
    const code = res.error?.code || "";
    if (code.includes("registration-token-not-registered") || code.includes("invalid-registration-token")) {
      return dispSnap.docs[i].ref.delete();
    }
    console.log("Falha ao enviar:", code);
    return null;
  }));
}
console.log(`Contas verificadas: ${contas}. Notificações enviadas: ${enviados}. Falhas: ${falhas}.`);
