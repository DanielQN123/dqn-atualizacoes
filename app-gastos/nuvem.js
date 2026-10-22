// Login e sincronização em tempo real com o Firebase.
// Só é carregado de fato quando firebase-config.js tem a configuração do projeto.
import { firebaseConfig } from "./firebase-config.js";

const $ = id => document.getElementById(id);
const LOTE = 400; // limite do Firestore é 500 operações por lote

const ERROS = {
  "auth/invalid-credential": "E-mail ou senha incorretos.",
  "auth/wrong-password": "E-mail ou senha incorretos.",
  "auth/user-not-found": "E-mail ou senha incorretos.",
  "auth/invalid-email": "E-mail inválido.",
  "auth/email-already-in-use": "Já existe uma conta com esse e-mail. Use \"Entrar\".",
  "auth/weak-password": "A senha precisa ter pelo menos 6 caracteres.",
  "auth/missing-password": "Digite a senha.",
  "auth/too-many-requests": "Muitas tentativas. Aguarde alguns minutos e tente de novo.",
  "auth/network-request-failed": "Sem internet. Conecte-se e tente de novo.",
};
const mensagem = e => ERROS[e.code] || "Não foi possível concluir. Tente de novo.";

if (firebaseConfig) iniciar();

async function iniciar() {
  document.body.dataset.modo = "nuvem";
  const fb = await import("./vendor/firebase.js");
  const app = fb.initializeApp(firebaseConfig);
  const auth = fb.getAuth(app);
  auth.languageCode = "pt";
  // Cache no aparelho: o app abre e lança gastos sem internet e envia quando conectar.
  const db = fb.initializeFirestore(app, {
    localCache: fb.persistentLocalCache({ tabManager: fb.persistentMultipleTabManager() }),
  });

  let pararGastos = null, pararPerfil = null;

  fb.onAuthStateChanged(auth, user => {
    pararGastos?.(); pararPerfil?.();
    pararGastos = pararPerfil = null;
    if (!user) {
      window.nuvem = null;
      window.app.limpar();
      document.body.dataset.logado = "nao";
      $("status").textContent = "";
      return;
    }
    document.body.dataset.logado = "sim";
    window.app.entrar();
    $("conta-email").textContent = user.email;
    $("backup-hint").textContent = "Seus gastos ficam salvos na sua conta. O backup serve para guardar uma cópia extra.";

    const gastosRef = fb.collection(db, "usuarios", user.uid, "gastos");
    const perfilRef = fb.doc(db, "usuarios", user.uid);

    window.nuvem = {
      async gravar(lista) {
        for (let i = 0; i < lista.length; i += LOTE) {
          const b = fb.writeBatch(db);
          lista.slice(i, i + LOTE).forEach(g => b.set(fb.doc(gastosRef, String(g.id)), { ...g }));
          await b.commit();
        }
      },
      async remover(ids) {
        for (let i = 0; i < ids.length; i += LOTE) {
          const b = fb.writeBatch(db);
          ids.slice(i, i + LOTE).forEach(id => b.delete(fb.doc(gastosRef, String(id))));
          await b.commit();
        }
      },
      gravarPerfil(campos) {
        return fb.setDoc(perfilRef, campos, { merge: true });
      },
    };

    let primeira = true;
    pararGastos = fb.onSnapshot(gastosRef, { includeMetadataChanges: true }, snap => {
      const lista = snap.docs.map(d => d.data()).filter(v => typeof v.valor === "number");
      window.app.setGastos(lista, !snap.metadata.fromCache);
      $("status").textContent = snap.metadata.hasPendingWrites
        ? "⏳ Salvo no aparelho, enviando para a nuvem…"
        : snap.metadata.fromCache
          ? "📴 Sem internet. O que você lançar será enviado quando conectar."
          : "☁️ Sincronizado com a sua conta.";
      if (primeira && !snap.metadata.fromCache) {
        primeira = false;
        oferecerMigracao(user.uid);
      }
    }, () => { $("status").textContent = "⚠️ Não foi possível carregar seus gastos."; });

    pararPerfil = fb.onSnapshot(perfilRef, snap => {
      if (snap.metadata.fromCache && !snap.exists()) return; // espera a resposta do servidor
      window.app.setPerfil(snap.data() || {});
    }, () => {});
  });

  // Lançamentos feitos antes de existir login ficam no aparelho: oferece enviar uma vez por conta.
  async function oferecerMigracao(uid) {
    const flag = "gastos.migrado." + uid;
    try { if (localStorage.getItem(flag)) return; } catch { return; }
    const locais = window.app.locais(), fixasLocais = window.app.fixasLocais();
    if (!locais.length && !fixasLocais.length) return;
    try { localStorage.setItem(flag, "1"); } catch {}
    if (!confirm(`Encontrei ${locais.length} lançamentos` +
                 (fixasLocais.length ? ` e ${fixasLocais.length} contas fixas` : "") +
                 " salvos só neste aparelho. Enviar para a sua conta?")) return;
    window.app.importar(locais, fixasLocais);
  }

  const form = $("login-form");
  const erro = txt => { $("login-erro").textContent = txt; };
  const dados = () => [$("login-email").value.trim(), $("login-senha").value];
  const ocupado = sim => form.querySelectorAll("button").forEach(b => { b.disabled = sim; });

  form.addEventListener("submit", async e => {
    e.preventDefault();
    erro(""); ocupado(true);
    try { await fb.signInWithEmailAndPassword(auth, ...dados()); form.reset(); }
    catch (ex) { erro(mensagem(ex)); }
    finally { ocupado(false); }
  });

  $("criar-conta").addEventListener("click", async () => {
    erro("");
    if (!form.reportValidity()) return;
    ocupado(true);
    try { await fb.createUserWithEmailAndPassword(auth, ...dados()); form.reset(); }
    catch (ex) { erro(mensagem(ex)); }
    finally { ocupado(false); }
  });

  $("esqueci").addEventListener("click", async () => {
    erro("");
    const email = $("login-email").value.trim();
    if (!email) { erro("Digite seu e-mail acima e toque de novo em \"Esqueci a senha\"."); return; }
    try {
      await fb.sendPasswordResetEmail(auth, email);
      erro("Se esse e-mail tiver conta, enviamos um link para criar uma nova senha.");
    } catch (ex) { erro(mensagem(ex)); }
  });

  $("sair").addEventListener("click", async () => {
    if (!confirm("Sair da sua conta neste aparelho?")) return;
    await fb.signOut(auth);
  });
}
