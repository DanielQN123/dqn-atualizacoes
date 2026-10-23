// Configuração do projeto Firebase (Console do Firebase → Configurações do projeto →
// Seus apps → app da Web → "Configuração do SDK"). Esses dados são públicos; quem protege
// os gastos de cada pessoa são as regras em firestore.rules.
//
// Enquanto estiver null, o app funciona sem login e salva só no aparelho.
export const firebaseConfig = null;

// Chave "Web Push" do Firebase (Configurações do projeto → Cloud Messaging →
// Certificados push da Web → Gerar par de chaves). Com null, os avisos ficam desligados.
export const vapidKey = null;
