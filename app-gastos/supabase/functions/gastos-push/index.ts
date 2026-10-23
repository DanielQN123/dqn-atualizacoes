// Meus Gastos — Edge Function "gastos-push" (projeto Supabase dqn-sistemas), com "Verify JWT" DESLIGADO:
//   - acao "chave": devolve a chave pública VAPID (o app precisa dela para ativar os avisos)
//   - acao "processar": chamada pelo banco (gastos_acordar_push); só entrega o que já está na fila
// As chaves VAPID são criadas aqui na primeira vez e guardadas em gastos_push_chave.

import { createClient } from 'npm:@supabase/supabase-js@2';
import webpush from 'npm:web-push@3.6.7';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });

function resposta(corpo: unknown, status = 200) {
  return new Response(JSON.stringify(corpo), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
}

let chaves: { publica: string; privada: string } | null = null;
async function obterChaves() {
  if (chaves) return chaves;
  const { data } = await admin.from('gastos_push_chave').select('publica, privada').eq('id', 1).maybeSingle();
  if (data) {
    chaves = data;
  } else {
    const k = webpush.generateVAPIDKeys();
    await admin.from('gastos_push_chave').insert({ id: 1, publica: k.publicKey, privada: k.privateKey });
    // se outra chamada criou ao mesmo tempo, vale a que ficou gravada
    const { data: gravada } = await admin.from('gastos_push_chave').select('publica, privada').eq('id', 1).single();
    chaves = gravada!;
  }
  webpush.setVapidDetails('https://danielqn123.github.io/dqn-atualizacoes/app-gastos/', chaves.publica, chaves.privada);
  return chaves;
}

async function processar() {
  await obterChaves();
  const { data: fila } = await admin.from('gastos_notificacao').select('id').eq('status', 'PENDENTE').order('criado_em').limit(50);
  let total = 0;
  for (const { id } of fila ?? []) {
    const { data: n } = await admin
      .from('gastos_notificacao')
      .update({ status: 'ENVIANDO' })
      .eq('id', id)
      .eq('status', 'PENDENTE')
      .select('id, usuario_id, titulo, corpo, url, tag')
      .maybeSingle();
    if (!n) continue;

    const { data: inscricoes } = await admin.from('gastos_push_inscricao').select('id, endpoint, p256dh, auth').eq('usuario_id', n.usuario_id);
    const payload = JSON.stringify({ titulo: n.titulo, corpo: n.corpo, url: n.url, tag: n.tag ?? `n${n.id}` });
    let entregues = 0;
    let ultimoErro: string | null = null;
    for (const s of inscricoes ?? []) {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { TTL: 20 * 3600, urgency: 'high' });
        entregues++;
        await admin.from('gastos_push_inscricao').update({ usado_em: new Date().toISOString() }).eq('id', s.id);
      } catch (e) {
        const status = (e as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) await admin.from('gastos_push_inscricao').delete().eq('id', s.id); // aparelho desinstalou/bloqueou
        else ultimoErro = String((e as Error).message ?? e).slice(0, 300);
      }
    }
    await admin
      .from('gastos_notificacao')
      .update({ status: entregues ? 'ENVIADA' : ultimoErro ? 'ERRO' : 'SEM_DESTINO', entregues, erro: ultimoErro, processado_em: new Date().toISOString() })
      .eq('id', n.id);
    total += entregues;
  }
  return { entregues: total, processadas: fila?.length ?? 0 };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  let corpo: { acao?: string } = {};
  try {
    corpo = await req.json();
  } catch {
    // corpo vazio = processar
  }
  try {
    if (corpo.acao === 'chave') return resposta({ chave: (await obterChaves()).publica });
    return resposta(await processar());
  } catch (e) {
    return resposta({ erro: String((e as Error).message ?? e) }, 500);
  }
});
