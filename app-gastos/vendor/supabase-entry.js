// Gera vendor/supabase.js (SDK do Supabase num arquivo só):
//   npm i @supabase/supabase-js@2 esbuild
//   npx esbuild supabase-entry.js --bundle --format=esm --minify --target=es2020 --legal-comments=none --outfile=supabase.js
export { createClient } from "@supabase/supabase-js";
