import { useState } from "react";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInWithPopup,
} from "firebase/auth";
import { doc, setDoc } from "firebase/firestore";
import { auth, provider, db } from "./firebase";

async function saveUser(u) {
  await setDoc(
    doc(db, "users", u.uid),
    {
      email: u.email.toLowerCase(),
      name: u.displayName || u.email.split("@")[0],
    },
    { merge: true }
  );
}

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSignup, setIsSignup] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    try {
      const cred = isSignup
        ? await createUserWithEmailAndPassword(auth, email, password)
        : await signInWithEmailAndPassword(auth, email, password);
      await saveUser(cred.user);
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleGoogle() {
    setError("");
    try {
      const cred = await signInWithPopup(auth, provider);
      await saveUser(cred.user);
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div style={{ maxWidth: 340, margin: "80px auto", textAlign: "center" }}>
      <h2>Cloud Chat</h2>
      <form onSubmit={handleSubmit}>
        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          style={{ width: "100%", padding: 8, marginBottom: 8 }}
        />
        <input
          type="password"
          placeholder="Password (min 6 characters)"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          style={{ width: "100%", padding: 8, marginBottom: 8 }}
        />
        <button type="submit" style={{ width: "100%", padding: 8 }}>
          {isSignup ? "Sign up" : "Log in"}
        </button>
      </form>
      <button onClick={handleGoogle} style={{ width: "100%", padding: 8, marginTop: 8 }}>
        Continue with Google
      </button>
      <p
        onClick={() => setIsSignup(!isSignup)}
        style={{ cursor: "pointer", color: "#2563eb" }}
      >
        {isSignup ? "Have an account? Log in" : "New here? Sign up"}
      </p>
      {error && <p style={{ color: "red", fontSize: 13 }}>{error}</p>}
    </div>
  );
}