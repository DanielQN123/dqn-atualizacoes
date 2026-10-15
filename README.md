# DQN Sistemas - atualizacoes

Instaladores e atualizacoes automaticas dos programas DQN Sistemas (Boi Bom Aparecida, Tres Lagoas e DQN Central).
Os programas instalados buscam aqui as versoes novas sozinhos.

## App de gastos

`app-gastos/index.html` é um controle de gastos pessoal que roda direto no navegador
(basta abrir o arquivo). Permite lançar, editar e excluir gastos, marcar se já foi pago, informar a forma
de pagamento (compras parceladas no cartão viram uma parcela por mês) e quem pagou.
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

### Login e sincronização (Firebase)

Com `app-gastos/firebase-config.js` preenchido, o app pede login (e-mail e senha) e salva os
gastos no Firestore em `usuarios/{uid}/gastos`, sincronizando em tempo real entre aparelhos e
funcionando sem internet. As regras de acesso estão em `app-gastos/firestore.rules`.
Sem configuração, o app continua salvando só no aparelho.
`app-gastos/vendor/firebase.js` é o SDK do Firebase empacotado (veja `vendor/firebase-entry.js`).
