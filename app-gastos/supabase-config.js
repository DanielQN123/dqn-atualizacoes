// Projeto Supabase onde ficam as contas e os gastos (dqn-sistemas, tabelas gastos_*).
// A chave é a "publishable" (pública); quem protege os gastos de cada pessoa são as regras (RLS) do banco.
//
// Enquanto estiver null, o app funciona sem login e salva só no aparelho.
export const supabaseConfig = {
  url: "https://fxxwikqjtmxczlkaedqd.supabase.co",
  chave: "sb_publishable_dR2Gl6XhxRBfQTxYDo4Nlg_ULDyYt8c",
};
