import { initializeApp } from "firebase/app";
import {
  getAuth,
  GoogleAuthProvider,
  signInWithRedirect,
  getRedirectResult,
  signOut,
  onAuthStateChanged,
} from "firebase/auth";
import {
  getFirestore, doc, getDoc, setDoc, onSnapshot,
} from "firebase/firestore";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

const provider = new GoogleAuthProvider();

// Mobil tarayicilarda popup genelde engellenir/calismaz, bu yuzden
// yonlendirme (redirect) yontemini kullaniyoruz - hem masaustu hem
// mobilde guvenilir calisir.
export const loginWithGoogle = () => signInWithRedirect(auth, provider);
export const logout = () => signOut(auth);
export const watchAuth = (cb) => onAuthStateChanged(auth, cb);
export const checkRedirectResult = () => getRedirectResult(auth);

export { doc, getDoc, setDoc, onSnapshot };