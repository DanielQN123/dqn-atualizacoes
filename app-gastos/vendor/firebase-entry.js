// Gera vendor/firebase.js (só as partes do Firebase que o app usa):
//   npm i firebase@13.0.0 esbuild
//   npx esbuild vendor/firebase-entry.js --bundle --format=esm --minify --outfile=vendor/firebase.js
export { initializeApp } from "firebase/app";
export {
  getAuth, onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword,
  sendPasswordResetEmail, signOut,
} from "firebase/auth";
export {
  initializeFirestore, persistentLocalCache, persistentMultipleTabManager,
  collection, doc, onSnapshot, writeBatch, setDoc,
} from "firebase/firestore";
