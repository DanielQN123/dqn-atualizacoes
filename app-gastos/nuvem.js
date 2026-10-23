// Login e sincronização em tempo real com o Firebase.
// Só é carregado de fato quando firebase-config.js tem a configuração do projeto.
import { firebaseConfig, vapidKey } from "./firebase-config.js";

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
  const avisos = criarAvisos(fb, app, db);

  fb.onAuthStateChanged(auth, user => {
    pararGastos?.(); pararPerfil?.();
    pararGastos = pararPerfil = null;
    if (!user) {
      avisos.sair();
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

    avisos.entrar(user);

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
    await avisos.desativar().catch(() => {}); // a próxima pessoa neste aparelho não recebe os avisos desta conta
    await fb.signOut(auth);
  });
}

// ---------- Avisos de vencimento (notificações) ----------
// Cada aparelho com avisos ativos grava seu token em usuarios/{uid}/dispositivos; o agendamento
// diário (avisos/enviar.mjs) envia para todos os aparelhos da conta.
function criarAvisos(fb, app, db) {
  const KEY_DISP = "gastos.aviso.dispositivo";
  const card = $("avisos-card"), status = $("avisos-status");
  const btAtivar = $("avisos-ativar"), btDesativar = $("avisos-desativar");
  const ios = /iPhone|iPad|iPod/.test(navigator.userAgent);
  const instalado = matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
  let usuario = null, messaging = null;

  const idLocal = () => { try { return localStorage.getItem(KEY_DISP); } catch { return null; } };
  const setIdLocal = v => { try { v ? localStorage.setItem(KEY_DISP, v) : localStorage.removeItem(KEY_DISP); } catch {} };
  const sha256 = async txt => [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(txt)))]
    .map(b => b.toString(16).padStart(2, "0")).join("");
  const refDisp = id => fb.doc(db, "usuarios", usuario.uid, "dispositivos", id);

  function mostrar(texto, botao) {
    card.hidden = false;
    status.textContent = texto;
    btAtivar.hidden = botao !== "ativar";
    btDesativar.hidden = botao !== "desativar";
  }

  async function suportado() {
    if (!vapidKey || !("Notification" in window) || !("serviceWorker" in navigator)) return false;
    try { return await fb.mensagensSuportadas(); } catch { return false; }
  }

  async function registrarToken() {
    const reg = await navigator.serviceWorker.ready;
    messaging ??= fb.getMessaging(app);
    const token = await fb.getToken(messaging, { vapidKey, serviceWorkerRegistration: reg });
    const id = await sha256(token);
    await fb.setDoc(refDisp(id), {
      token, atualizado: new Date().toISOString(), aparelho: navigator.userAgent.slice(0, 150),
    });
    const antigo = idLocal();
    if (antigo && antigo !== id) {
      const b = fb.writeBatch(db); b.delete(refDisp(antigo)); b.commit().catch(() => {});
    }
    setIdLocal(id);
  }

  async function atualizarTela() {
    if (!usuario) { card.hidden = true; return; }
    if (!(await suportado())) {
      if (vapidKey && ios && !instalado) {
        mostrar("No iPhone, primeiro adicione o app à Tela de Início (Safari → Compartilhar → " +
                "Adicionar à Tela de Início) e abra por lá para ativar os avisos.");
      } else if (vapidKey) {
        mostrar("Este navegador não recebe notificações. No Android use o Chrome; no iPhone, o app instalado na Tela de Início.");
      } else {
        card.hidden = true;
      }
      return;
    }
    if (Notification.permission === "denied") {
      mostrar("As notificações deste app estão bloqueadas. Libere nas configurações do celular " +
              "(Notificações → Meus Gastos ou Chrome) e volte aqui.");
    } else if (Notification.permission === "granted" && idLocal()) {
      mostrar("✅ Avisos ativos neste aparelho.", "desativar");
    } else {
      mostrar("Os avisos estão desligados neste aparelho.", "ativar");
    }
  }

  btAtivar.addEventListener("click", async () => {
    btAtivar.disabled = true;
    try {
      const perm = await Notification.requestPermission();
      if (perm === "granted") await registrarToken();
    } catch {
      alert("Não foi possível ativar os avisos agora. Verifique a internet e tente de novo.");
    } finally {
      btAtivar.disabled = false;
      atualizarTela();
    }
  });

  async function desativar() {
    const id = idLocal();
    if (!id || !usuario) return;
    setIdLocal(null);
    const b = fb.writeBatch(db); b.delete(refDisp(id));
    await Promise.allSettled([b.commit(), messaging ? fb.deleteToken(messaging) : null]);
  }

  btDesativar.addEventListener("click", async () => {
    btDesativar.disabled = true;
    await desativar().catch(() => {});
    btDesativar.disabled = false;
    atualizarTela();
  });

  return {
    async entrar(user) {
      usuario = user;
      await atualizarTela();
      // O token pode mudar com o tempo: renova a cada abertura se os avisos estiverem ativos.
      if (idLocal() && (await suportado()) && Notification.permission === "granted") {
        registrarToken().catch(() => {});
      }
    },
    sair() { usuario = null; card.hidden = true; },
    desativar,
  };
}
