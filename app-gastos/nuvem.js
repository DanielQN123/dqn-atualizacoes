// Login e sincronização em tempo real com o Supabase (projeto dqn-sistemas, tabelas gastos_*).
// Só é carregado de fato quando supabase-config.js tem a configuração do projeto.
// Tudo o que é lançado vai primeiro para uma cópia no aparelho (funciona sem internet) e é
// enviado para a conta assim que houver conexão.
import { supabaseConfig } from "./supabase-config.js";

const $ = id => document.getElementById(id);
const APP_URL = new URL("./", location.href).href;
const LOTE = 500;

const ERROS = {
  invalid_credentials: "E-mail ou senha incorretos.",
  email_not_confirmed: "Confirme seu e-mail pelo link que enviamos e tente de novo.",
  user_already_exists: "Já existe uma conta com esse e-mail. Use \"Entrar\".",
  email_exists: "Já existe uma conta com esse e-mail. Use \"Entrar\".",
  weak_password: "A senha precisa ter pelo menos 6 caracteres.",
  email_address_invalid: "E-mail inválido.",
  validation_failed: "Confira o e-mail e a senha.",
  over_request_rate_limit: "Muitas tentativas. Aguarde alguns minutos e tente de novo.",
  over_email_send_rate_limit: "Muitos e-mails enviados. Aguarde alguns minutos e tente de novo.",
  signup_disabled: "A criação de contas está desligada. Fale com o suporte.",
  same_password: "A nova senha precisa ser diferente da anterior.",
};
const semInternet = e => !navigator.onLine || e?.name === "AuthRetryableFetchError" || /fetch|network/i.test(e?.message || "");
const mensagem = e => ERROS[e?.code] || (semInternet(e) ? "Sem internet. Conecte-se e tente de novo." : "Não foi possível concluir. Tente de novo.");

if (supabaseConfig) iniciar();

async function iniciar() {
  document.body.dataset.modo = "nuvem";
  const { createClient } = await import("./vendor/supabase.js");
  const sb = createClient(supabaseConfig.url, supabaseConfig.chave, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, storageKey: "gastos.sessao" },
  });

  // ---------- Cópia no aparelho + fila do que falta enviar ----------
  let usuario = null, cache = null, canal = null, enviando = false, erroEnvio = false, carregou = false;
  let reenvio = null, versaoCarga = 0, agendado = null;
  const chaveCache = uid => "gastos.nuvem." + uid;
  const lerCache = uid => { try { return JSON.parse(localStorage.getItem(chaveCache(uid))); } catch { return null; } };
  const salvarCache = () => { try { localStorage.setItem(chaveCache(usuario.id), JSON.stringify(cache)); } catch {} };
  const pendenteDe = id => cache.pendentes.some(o => o.id === id);

  function entregar() {
    if (!cache.sincronizado) return; // sem nada confirmado da conta ainda: continua "Carregando…"
    window.app.setGastos(Object.values(cache.gastos), true);
    window.app.setPerfil(cache.perfil || {});
  }
  const entregarLogo = () => { clearTimeout(agendado); agendado = setTimeout(entregar, 60); };

  function atualizarStatus() {
    if (!usuario) return;
    const n = cache.pendentes.length;
    $("status").textContent =
      !navigator.onLine ? "📴 Sem internet. O que você lançar será enviado quando conectar."
      : erroEnvio ? "⚠️ Não foi possível enviar para a nuvem. Tentando de novo…"
      : n ? "⏳ Salvo no aparelho, enviando para a nuvem…"
      : !carregou && !cache.sincronizado ? "Carregando…"
      : !carregou ? "⚠️ Não foi possível carregar seus gastos."
      : "☁️ Sincronizado com a sua conta.";
  }

  // Uma operação nova sobre o mesmo lançamento substitui a anterior que ainda não foi enviada.
  function enfileirar(op) {
    if (op.tipo === "perfil") {
      const antiga = cache.pendentes.find(o => o.tipo === "perfil");
      if (antiga) op.campos = { ...antiga.campos, ...op.campos };
      cache.pendentes = cache.pendentes.filter(o => o.tipo !== "perfil");
    } else {
      cache.pendentes = cache.pendentes.filter(o => o.id !== op.id);
    }
    cache.pendentes.push(op);
  }

  async function enviar() {
    if (enviando || !usuario || !cache.pendentes.length) { atualizarStatus(); return; }
    enviando = true;
    const uid = usuario.id, meu = cache;
    try {
      while (usuario?.id === uid && meu.pendentes.length) {
        // junta operações seguidas do mesmo tipo num envio só
        const tipo = meu.pendentes[0].tipo;
        const lote = [];
        for (const o of meu.pendentes) { if (o.tipo !== tipo || lote.length >= LOTE) break; lote.push(o); }
        let r;
        const agora = new Date().toISOString();
        if (tipo === "gravar") {
          r = await sb.from("gastos_lancamento")
            .upsert(lote.map(o => ({ usuario_id: uid, id: o.id, dados: o.dados, atualizado_em: agora })), { onConflict: "usuario_id,id" });
        } else if (tipo === "remover") {
          r = await sb.from("gastos_lancamento").delete().eq("usuario_id", uid).in("id", lote.map(o => o.id));
        } else {
          r = await sb.from("gastos_perfil").upsert({ usuario_id: uid, ...lote[0].campos, atualizado_em: agora }, { onConflict: "usuario_id" });
        }
        if (r.error) throw r.error;
        meu.pendentes = meu.pendentes.filter(o => !lote.includes(o));
        if (usuario?.id === uid) salvarCache();
      }
      erroEnvio = false;
    } catch (e) {
      erroEnvio = !semInternet(e);
      clearTimeout(reenvio);
      reenvio = setTimeout(enviar, 30000);
    } finally {
      enviando = false;
      atualizarStatus();
    }
  }

  async function lerTudo(uid) {
    const linhas = [];
    for (let de = 0; ; de += 1000) {
      const { data, error } = await sb.from("gastos_lancamento").select("id, dados").eq("usuario_id", uid).order("id").range(de, de + 999);
      if (error) throw error;
      linhas.push(...data);
      if (data.length < 1000) return linhas;
    }
  }

  async function carregar() {
    if (!usuario) return;
    const uid = usuario.id, versao = ++versaoCarga;
    try {
      const [linhas, perfil] = await Promise.all([
        lerTudo(uid),
        sb.from("gastos_perfil").select("orcamento, fixas").eq("usuario_id", uid).maybeSingle()
          .then(r => { if (r.error) throw r.error; return r.data; }),
      ]);
      if (usuario?.id !== uid || versao !== versaoCarga) return;
      // o que ainda não foi enviado vale mais do que o que veio da nuvem
      const gastos = Object.fromEntries(linhas.filter(l => typeof l.dados?.valor === "number").map(l => [l.id, l.dados]));
      let p = perfil ? { orcamento: perfil.orcamento === null ? null : Number(perfil.orcamento), fixas: perfil.fixas } : {};
      for (const o of cache.pendentes) {
        if (o.tipo === "gravar") gastos[o.id] = o.dados;
        else if (o.tipo === "remover") delete gastos[o.id];
        else p = { ...p, ...o.campos };
      }
      cache.gastos = gastos;
      cache.perfil = p;
      cache.sincronizado = true;
      salvarCache();
      const primeira = !carregou;
      carregou = true;
      entregar();
      if (primeira) oferecerMigracao(uid);
    } catch {
      if (usuario?.id === uid) entregar(); // sem internet: segue com a cópia do aparelho
    } finally {
      atualizarStatus();
    }
  }

  function assinar(uid) {
    canal = sb.channel("gastos-" + uid)
      .on("postgres_changes", { event: "*", schema: "public", table: "gastos_lancamento", filter: `usuario_id=eq.${uid}` }, p => {
        if (usuario?.id !== uid) return;
        if (p.eventType === "DELETE") {
          if (p.old?.usuario_id !== uid || pendenteDe(p.old.id)) return;
          delete cache.gastos[p.old.id];
        } else {
          if (pendenteDe(p.new.id) || typeof p.new.dados?.valor !== "number") return;
          cache.gastos[p.new.id] = p.new.dados;
        }
        salvarCache();
        entregarLogo();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "gastos_perfil", filter: `usuario_id=eq.${uid}` }, p => {
        if (usuario?.id !== uid || p.eventType === "DELETE" || cache.pendentes.some(o => o.tipo === "perfil")) return;
        cache.perfil = { orcamento: p.new.orcamento === null ? null : Number(p.new.orcamento), fixas: p.new.fixas };
        salvarCache();
        entregarLogo();
      })
      // ao (re)conectar, busca tudo de novo para não perder o que mudou enquanto estava desconectado
      .subscribe(status => { if (status === "SUBSCRIBED") carregar(); });
  }

  const avisos = criarAvisos(sb);

  function trocarUsuario(user) {
    if (canal) { sb.removeChannel(canal); canal = null; }
    clearTimeout(reenvio);
    versaoCarga++;
    if (!user) {
      avisos.sair();
      usuario = cache = null;
      window.nuvem = null;
      window.app.limpar();
      document.body.dataset.logado = "nao";
      $("status").textContent = "";
      return;
    }
    usuario = user;
    cache = lerCache(user.id) || { gastos: {}, perfil: null, pendentes: [], sincronizado: false };
    carregou = erroEnvio = false;
    document.body.dataset.logado = "sim";
    window.app.entrar();
    $("conta-email").textContent = user.email;
    $("backup-hint").textContent = "Seus gastos ficam salvos na sua conta. O backup serve para guardar uma cópia extra.";

    window.nuvem = {
      async gravar(lista) {
        for (const g of lista) { cache.gastos[g.id] = { ...g }; enfileirar({ tipo: "gravar", id: g.id, dados: { ...g } }); }
        salvarCache(); enviar();
      },
      async remover(ids) {
        for (const id of ids) { delete cache.gastos[id]; enfileirar({ tipo: "remover", id }); }
        salvarCache(); enviar();
      },
      async gravarPerfil(campos) {
        cache.perfil = { ...cache.perfil, ...campos };
        enfileirar({ tipo: "perfil", campos: { ...campos } });
        salvarCache(); enviar();
      },
    };

    entregar();
    atualizarStatus();
    assinar(user.id);
    carregar();
    enviar();
    avisos.entrar(user);
  }

  let primeiroEvento = true;
  sb.auth.onAuthStateChange((evento, session) => {
    // não chamar o Supabase direto aqui dentro (trava o login): agenda para logo depois
    setTimeout(() => {
      if (evento === "PASSWORD_RECOVERY") novaSenha();
      const user = session?.user ?? null;
      if (!primeiroEvento && (user?.id ?? null) === (usuario?.id ?? null)) return; // só renovou o acesso
      primeiroEvento = false;
      trocarUsuario(user);
    }, 0);
  });

  async function novaSenha() {
    const senha = prompt("Digite a nova senha (pelo menos 6 caracteres):");
    if (!senha) return;
    const { error } = await sb.auth.updateUser({ password: senha });
    alert(error ? mensagem(error) : "Senha alterada.");
  }

  addEventListener("online", () => { enviar(); carregar(); });
  addEventListener("offline", atualizarStatus);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && usuario) { enviar(); carregar(); }
  });

  // Lançamentos feitos antes de existir login ficam no aparelho: oferece enviar uma vez por conta.
  function oferecerMigracao(uid) {
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
  const dados = () => ({ email: $("login-email").value.trim(), password: $("login-senha").value });
  const ocupado = sim => form.querySelectorAll("button").forEach(b => { b.disabled = sim; });

  form.addEventListener("submit", async e => {
    e.preventDefault();
    erro(""); ocupado(true);
    try {
      const { error } = await sb.auth.signInWithPassword(dados());
      if (error) throw error;
      form.reset();
    } catch (ex) { erro(mensagem(ex)); }
    finally { ocupado(false); }
  });

  $("criar-conta").addEventListener("click", async () => {
    erro("");
    if (!form.reportValidity()) return;
    ocupado(true);
    try {
      const d = dados();
      const { data, error } = await sb.auth.signUp({ ...d, options: { emailRedirectTo: APP_URL } });
      if (error) throw error;
      // Conta já existente com e-mail confirmado volta sem identidades (o Supabase não diz o motivo).
      if (data.user && !data.user.identities?.length) throw { code: "user_already_exists" };
      if (!data.session) erro(`Enviamos um link de confirmação para ${d.email}. Abra o e-mail, toque no link e depois entre aqui.`);
      else form.reset();
    } catch (ex) { erro(mensagem(ex)); }
    finally { ocupado(false); }
  });

  $("esqueci").addEventListener("click", async () => {
    erro("");
    const email = $("login-email").value.trim();
    if (!email) { erro("Digite seu e-mail acima e toque de novo em \"Esqueci a senha\"."); return; }
    const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: APP_URL });
    erro(error ? mensagem(error) : "Se esse e-mail tiver conta, enviamos um link para criar uma nova senha.");
  });

  $("sair").addEventListener("click", async () => {
    const n = cache?.pendentes.length || 0;
    if (!confirm(n ? `${n} alteração(ões) ainda não foram enviadas (sem internet) e serão perdidas. Sair mesmo assim?`
                   : "Sair da sua conta neste aparelho?")) return;
    const uid = usuario?.id;
    await avisos.desativar().catch(() => {}); // a próxima pessoa neste aparelho não recebe os avisos desta conta
    await sb.auth.signOut({ scope: "local" });
    try { if (uid) localStorage.removeItem(chaveCache(uid)); } catch {}
  });
}

// ---------- Avisos de vencimento (notificações) ----------
// Cada aparelho com avisos ativos grava sua inscrição (Web Push) em gastos_push_inscricao. Todo dia o banco
// monta os avisos (gastos_lembrete) e a Edge Function gastos-push entrega em todos os aparelhos da conta.
function criarAvisos(sb) {
  const KEY_CHAVE = "gastos.aviso.chave";
  const card = $("avisos-card"), status = $("avisos-status");
  const btAtivar = $("avisos-ativar"), btDesativar = $("avisos-desativar");
  const ios = /iPhone|iPad|iPod/.test(navigator.userAgent);
  const instalado = matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
  let usuario = null;

  const suportado = () => location.protocol === "https:" && "serviceWorker" in navigator &&
    "PushManager" in window && "Notification" in window;

  function mostrar(texto, botao) {
    card.hidden = false;
    status.textContent = texto;
    btAtivar.hidden = botao !== "ativar";
    btDesativar.hidden = botao !== "desativar";
  }

  async function inscricaoAtual() {
    const reg = await navigator.serviceWorker.getRegistration();
    return reg ? reg.pushManager.getSubscription() : null;
  }

  async function chavePublica() {
    try { const c = localStorage.getItem(KEY_CHAVE); if (c) return c; } catch {}
    const { data, error } = await sb.functions.invoke("gastos-push", { body: { acao: "chave" } });
    if (error || !data?.chave) throw error || new Error("sem chave");
    try { localStorage.setItem(KEY_CHAVE, data.chave); } catch {}
    return data.chave;
  }
  const bytes = b64 => {
    const s = atob((b64 + "=".repeat((4 - b64.length % 4) % 4)).replace(/-/g, "+").replace(/_/g, "/"));
    return Uint8Array.from(s, c => c.charCodeAt(0));
  };

  async function gravarInscricao(sub) {
    const j = sub.toJSON();
    return sb.from("gastos_push_inscricao").upsert({
      usuario_id: usuario.id, endpoint: j.endpoint, p256dh: j.keys.p256dh, auth: j.keys.auth,
      aparelho: navigator.userAgent.slice(0, 150),
    }, { onConflict: "endpoint" });
  }

  async function registrar() {
    const reg = await navigator.serviceWorker.ready;
    const chave = await chavePublica();
    let sub = await reg.pushManager.getSubscription();
    if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: bytes(chave) });
    let { error } = await gravarInscricao(sub);
    if (error) {
      // inscrição que ficou de outra conta neste aparelho: troca por uma nova
      await sub.unsubscribe().catch(() => {});
      sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: bytes(chave) });
      ({ error } = await gravarInscricao(sub));
      if (error) throw error;
    }
  }

  async function atualizarTela() {
    if (!usuario) { card.hidden = true; return; }
    if (!suportado()) {
      if (ios && !instalado) {
        mostrar("No iPhone, primeiro adicione o app à Tela de Início (Safari → Compartilhar → " +
                "Adicionar à Tela de Início) e abra por lá para ativar os avisos.");
      } else {
        mostrar("Este navegador não recebe notificações. No Android use o Chrome; no iPhone, o app instalado na Tela de Início.");
      }
      return;
    }
    if (Notification.permission === "denied") {
      mostrar("As notificações deste app estão bloqueadas. Libere nas configurações do celular " +
              "(Notificações → Meus Gastos ou Chrome) e volte aqui.");
    } else if (Notification.permission === "granted" && (await inscricaoAtual())) {
      mostrar("✅ Avisos ativos neste aparelho.", "desativar");
    } else {
      mostrar("Os avisos estão desligados neste aparelho.", "ativar");
    }
  }

  btAtivar.addEventListener("click", async () => {
    btAtivar.disabled = true;
    try {
      const perm = await Notification.requestPermission();
      if (perm === "granted") {
        await registrar();
        await sb.rpc("gastos_testar_push"); // chega uma notificação de teste em seguida
      }
    } catch {
      alert("Não foi possível ativar os avisos agora. Verifique a internet e tente de novo.");
    } finally {
      btAtivar.disabled = false;
      atualizarTela();
    }
  });

  async function desativar() {
    if (!usuario || !suportado()) return;
    const sub = await inscricaoAtual();
    if (!sub) return;
    await sb.from("gastos_push_inscricao").delete().eq("endpoint", sub.endpoint);
    await sub.unsubscribe().catch(() => {});
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
      // garante que a inscrição deste aparelho está na conta (pode ter mudado com o tempo)
      if (suportado() && Notification.permission === "granted" && (await inscricaoAtual())) registrar().catch(() => {});
    },
    sair() { usuario = null; card.hidden = true; },
    desativar,
  };
}
