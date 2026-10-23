# DQN Sistemas - atualizacoes

Instaladores e atualizacoes automaticas dos programas DQN Sistemas (Boi Bom Aparecida, Tres Lagoas e DQN Central).
Os programas instalados buscam aqui as versoes novas sozinhos.

## App de gastos

`app-gastos/index.html` é um controle de gastos pessoal que roda direto no navegador
(basta abrir o arquivo). Permite lançar, editar e excluir gastos, marcar se já foi pago, informar a forma
de pagamento (compras parceladas no cartão viram uma parcela por mês) e quem pagou.
Para o controle mensal: entradas (salário, renda) e saldo do mês, contas fixas que entram
sozinhas todo mês, vencimentos com aviso de contas atrasadas ou perto de vencer, e
comparação dos últimos 6 meses.
Mostra o total do mês, quanto já foi pago e quanto falta pagar, o resumo por
categoria e por pessoa, um orçamento mensal e exporta CSV (abre no Excel).
Aberto direto do arquivo, os dados ficam salvos no próprio navegador (localStorage).

### Instalar no celular (Android e iPhone)

Endereço do app: https://danielqn123.github.io/dqn-atualizacoes/app-gastos/

- **iPhone:** abra o endereço no **Safari** → botão Compartilhar → **Adicionar à Tela de Início**.
- **Android:** abra o endereço no **Chrome** → menu ⋮ → **Instalar app** (ou "Adicionar à tela inicial").

Os dados ficam em cada aparelho. Use **Fazer backup / Restaurar backup** para guardar
uma cópia ou passar os dados de um celular para outro.

O ícone usa o símbolo da logo DQN Sistemas. Para trocar: `python3 app-gastos/gerar-icones.py simbolo.png "#ffffff"`
(a cor é o fundo atrás da logo) e aumente a versão em `app-gastos/sw.js`.

### Login e sincronização (Supabase)

O app usa o projeto Supabase **dqn-sistemas** (`app-gastos/supabase-config.js`), em tabelas próprias
separadas das do ERP: `gastos_lancamento` (um lançamento por linha, em `dados`), `gastos_perfil`
(orçamento e contas fixas), `gastos_push_inscricao`, `gastos_notificacao` e `gastos_push_chave`.
Cada pessoa só lê e grava as próprias linhas (RLS por `usuario_id`). O app pede login (e-mail e senha),
sincroniza em tempo real (Realtime) e funciona sem internet: o que é lançado fica numa fila no aparelho e
é enviado quando conectar. Com `supabaseConfig = null`, o app volta a salvar só no aparelho.
`app-gastos/vendor/supabase.js` é o SDK do Supabase empacotado (veja `vendor/supabase-entry.js`).

### Avisos de vencimento (notificações)

O app mostra "Ativar avisos neste aparelho" (no iPhone, só no app instalado na Tela de Início) e grava a
inscrição Web Push em `gastos_push_inscricao`; ao ativar chega uma notificação de teste. Todo dia às 07:47
(Campo Grande) o `pg_cron` roda `gastos_interno.gastos_lembrete()`, que monta o aviso das contas que vencem
em 3 dias, hoje ou venceram ontem, e a Edge Function `gastos-push`
(`app-gastos/supabase/functions/gastos-push/index.ts`, "Verify JWT" desligado) entrega em todos os
aparelhos da conta. As chaves VAPID são criadas pela própria função e ficam em `gastos_push_chave`.
