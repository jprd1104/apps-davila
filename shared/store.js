// Camada de dados dos apps D'Ávila.
// Oferece uma API mínima no formato do Firestore (collection/doc/set/update/delete/onSnapshot)
// sobre dois motores: Firebase (sincroniza entre aparelhos) ou localStorage (só neste aparelho).
import { FIREBASE_CONFIG } from "./config.js";

const FB = "https://www.gstatic.com/firebasejs/10.12.2/";

/* ---------------- motor local ---------------- */
function localEngine(app) {
  const key = (c) => `davila:${app}:${c}`;
  const read = (c) => { try { return JSON.parse(localStorage.getItem(key(c)) || "{}"); } catch { return {}; } };
  const write = (c, obj) => { try { localStorage.setItem(key(c), JSON.stringify(obj)); } catch (e) { console.warn(e); throw { code: "quota_exceeded" }; } };
  const subs = {}; // c -> Set(fn)
  const snapOf = (c, prev) => {
    const cur = read(c);
    const docs = Object.keys(cur).sort().map((id) => wrapLocal(id, cur[id]));
    const changes = [];
    for (const id of Object.keys(cur)) changes.push({ type: prev && prev[id] ? "modified" : "added", doc: wrapLocal(id, cur[id]) });
    if (prev) for (const id of Object.keys(prev)) if (!(id in cur)) changes.push({ type: "removed", doc: wrapLocal(id, prev[id]) });
    return { docs, size: docs.length, empty: !docs.length, docChanges: () => changes, metadata: { fromCache: false } };
  };
  const emit = (c, prev) => { (subs[c] || new Set()).forEach((fn) => { try { fn(snapOf(c, prev)); } catch (e) { console.error(e); } }); };
  const split = (path) => { const p = path.split("/"); return [p.slice(0, -1).join("/"), p[p.length - 1]]; };
  const docRef = (c, id) => ({
    id, path: c + "/" + id,
    async get() { const cur = read(c); return wrapLocal(id, cur[id]); },
    async set(data) { const prev = read(c); const cur = { ...prev, [id]: clone(data) }; write(c, cur); emit(c, prev); },
    async update(data) { const prev = read(c); if (!prev[id]) throw { code: "invalid_argument" }; const cur = { ...prev, [id]: { ...prev[id], ...clone(data) } }; write(c, cur); emit(c, prev); },
    async delete() { const prev = read(c); if (!(id in prev)) return; const cur = { ...prev }; delete cur[id]; write(c, cur); emit(c, prev); },
    onSnapshot(next) { const fn = (s) => next(s.docs.find((d) => d.id === id) || wrapLocal(id, undefined)); (subs[c] ||= new Set()).add(fn); setTimeout(() => fn(snapOf(c)), 0); return () => subs[c].delete(fn); },
  });
  const colRef = (c) => {
    const q = {
      path: c,
      doc: (id) => docRef(c, id || Math.random().toString(36).slice(2, 12) + Date.now().toString(36)),
      async add(data) { const r = q.doc(); await r.set(data); return r; },
      limit: () => q, where: () => q, orderBy: () => q,
      async get() { return snapOf(c); },
      onSnapshot(next) { (subs[c] ||= new Set()).add(next); setTimeout(() => next(snapOf(c)), 0); return () => subs[c].delete(next); },
    };
    return q;
  };
  window.addEventListener("storage", (e) => {
    const pre = `davila:${app}:`;
    if (e.key && e.key.startsWith(pre)) { const c = e.key.slice(pre.length); let prev = {}; try { prev = JSON.parse(e.oldValue || "{}"); } catch {} emit(c, prev); }
  });
  return {
    mode: "local",
    collection: (c) => colRef(c),
    doc: (path) => { const [c, id] = split(path); return docRef(c, id); },
    async batchSet(c, entries) { const prev = read(c); const cur = { ...prev }; for (const [id, d] of entries) cur[id] = clone(d); write(c, cur); emit(c, prev); },
    exportAll() { const out = {}; for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k.startsWith(`davila:${app}:`)) out[k.slice(`davila:${app}:`.length)] = read(k.slice(`davila:${app}:`.length)); } return out; },
  };
}
function wrapLocal(id, data) { return { id, exists: data !== undefined, data: () => (data === undefined ? undefined : clone(data)), metadata: { fromCache: false, hasPendingWrites: false } }; }
const clone = (x) => JSON.parse(JSON.stringify(x));

/* ---------------- motor Firebase ---------------- */
async function firebaseEngine(app, fbUser, fs, M) {
  const base = `users/${fbUser.uid}/apps/${app}`; // users/{uid}/apps/{app}/{colecao}/{doc}
  const wrap = (s) => ({ id: s.id, exists: s.exists(), data: () => s.data(), metadata: s.metadata });
  const docRef = (c, id) => {
    const r = M.doc(fs, `${base}/${c}/${id}`);
    return {
      id, path: c + "/" + id,
      async get() { return wrap(await M.getDoc(r)); },
      set: (d) => M.setDoc(r, d),
      update: (d) => M.updateDoc(r, d),
      delete: () => M.deleteDoc(r),
      onSnapshot: (next, err) => M.onSnapshot(r, { includeMetadataChanges: false }, (s) => next(wrap(s)), err),
    };
  };
  const colRef = (c, lim) => {
    const cr = M.collection(fs, `${base}/${c}`);
    const qq = () => (lim ? M.query(cr, M.limit(lim)) : cr);
    const q = {
      path: c,
      doc: (id) => docRef(c, id || M.doc(cr).id),
      async add(d) { const r = q.doc(); await r.set(d); return r; },
      limit: (n) => colRef(c, n), where: () => q, orderBy: () => q,
      async get() { const s = await M.getDocs(qq()); return { docs: s.docs.map(wrap), size: s.size, empty: s.empty, docChanges: () => s.docChanges().map((x) => ({ type: x.type, doc: wrap(x.doc) })), metadata: s.metadata }; },
      onSnapshot: (next, err) => M.onSnapshot(qq(), (s) => next({ docs: s.docs.map(wrap), size: s.size, empty: s.empty, docChanges: () => s.docChanges().map((x) => ({ type: x.type, doc: wrap(x.doc) })), metadata: s.metadata }), err),
    };
    return q;
  };
  return {
    mode: "firebase",
    user: fbUser,
    collection: (c) => colRef(c),
    doc: (path) => { const p = path.split("/"); return docRef(p.slice(0, -1).join("/"), p[p.length - 1]); },
    async batchSet(c, entries) {
      for (let i = 0; i < entries.length; i += 400) {
        const b = M.writeBatch(fs);
        for (const [id, d] of entries.slice(i, i + 400)) b.set(M.doc(fs, `${base}/${c}/${id}`), d);
        await b.commit();
      }
    },
  };
}

/* ---------------- tela de login ---------------- */
function loginUI(onGoogle, onEmail, msg) {
  let el = document.getElementById("davila-login");
  if (!el) { el = document.createElement("div"); el.id = "davila-login"; document.body.appendChild(el); }
  el.innerHTML = `
  <div class="dl-card">
    <div class="dl-ex">Apps D'Ávila</div>
    <h1>Entrar</h1>
    <p>Entre para sincronizar seus dados entre o celular e o computador.</p>
    <button type="button" class="dl-btn dl-pri" id="dlG">Entrar com Google</button>
    <details><summary>Entrar com e-mail e senha</summary>
      <form id="dlF"><label>E-mail <input id="dlE" type="email" autocomplete="email" required></label>
      <label>Senha <input id="dlP" type="password" autocomplete="current-password" minlength="6" required></label>
      <div class="dl-row"><button class="dl-btn dl-pri" type="submit">Entrar</button><button class="dl-btn" type="button" id="dlC">Criar conta</button></div></form></details>
    <p class="dl-msg" id="dlM">${msg || ""}</p>
  </div>`;
  el.hidden = false;
  el.querySelector("#dlG").onclick = onGoogle;
  el.querySelector("#dlF").onsubmit = (e) => { e.preventDefault(); onEmail(el.querySelector("#dlE").value, el.querySelector("#dlP").value, false); };
  el.querySelector("#dlC").onclick = () => { const f = el.querySelector("#dlF"); if (f.reportValidity()) onEmail(el.querySelector("#dlE").value, el.querySelector("#dlP").value, true); };
  return { msg: (t) => (el.querySelector("#dlM").textContent = t), close: () => (el.hidden = true) };
}
const LOGIN_CSS = `#davila-login{position:fixed;inset:0;z-index:100;background:var(--paper,#F1F3EE);display:grid;place-items:center;padding:24px max(16px,env(safe-area-inset-left,0px))}
#davila-login .dl-card{max-width:380px;width:100%;display:flex;flex-direction:column;gap:12px;font-family:var(--f-ui,system-ui)}
#davila-login .dl-ex{font:500 11px var(--f-mono,monospace);letter-spacing:.18em;text-transform:uppercase;color:var(--brass,#946E1F)}
#davila-login h1{font:700 40px/1 var(--f-display,Georgia,serif);margin:0;color:var(--ink,#17201B)}
#davila-login p{margin:0;color:var(--muted,#5D6962)}
#davila-login .dl-btn{border:1px solid var(--rule,#D6DCD4);background:var(--card,#fff);color:var(--ink,#17201B);border-radius:8px;padding:11px 14px;font-weight:600;font-size:15px;cursor:pointer}
#davila-login .dl-pri{background:var(--accent,#1D5A43);color:var(--accent-ink,#fff);border-color:var(--accent,#1D5A43)}
#davila-login form{display:flex;flex-direction:column;gap:10px;margin-top:10px}
#davila-login label{display:flex;flex-direction:column;gap:4px;font-size:13px;color:var(--muted,#5D6962)}
#davila-login input{padding:10px;border:1px solid var(--rule,#D6DCD4);border-radius:8px;background:var(--card,#fff);color:var(--ink,#17201B);font-size:16px}
#davila-login summary{cursor:pointer;color:var(--muted,#5D6962);font-size:14px}
#davila-login .dl-row{display:flex;gap:8px}
#davila-login .dl-msg{color:var(--danger,#9B3B2E);font-size:14px;min-height:1.2em}`;

/* ---------------- ponto de entrada ---------------- */
// Resolve com o objeto db (API Firestore-like) depois do login, ou em modo local.
export async function openStore(app) {
  if (!FIREBASE_CONFIG) return localEngine(app);
  const st = document.createElement("style"); st.textContent = LOGIN_CSS; document.head.appendChild(st);
  const [{ initializeApp }, A, M] = await Promise.all([
    import(FB + "firebase-app.js"), import(FB + "firebase-auth.js"), import(FB + "firebase-firestore.js"),
  ]);
  const fa = initializeApp(FIREBASE_CONFIG);
  const auth = A.getAuth(fa);
  await A.setPersistence(auth, A.browserLocalPersistence).catch(() => {});
  let fs;
  try { fs = M.initializeFirestore(fa, { ignoreUndefinedProperties: true, localCache: M.persistentLocalCache({ tabManager: M.persistentMultipleTabManager() }) }); }
  catch { fs = M.initializeFirestore(fa, { ignoreUndefinedProperties: true }); }
  try { await A.getRedirectResult(auth); } catch (e) { console.warn(e); }
  const traduz = (e) => {
    const c = (e && e.code) || "";
    if (c.includes("wrong-password") || c.includes("invalid-credential")) return "E-mail ou senha incorretos.";
    if (c.includes("user-not-found")) return "Conta não encontrada. Use \"Criar conta\".";
    if (c.includes("email-already-in-use")) return "Esse e-mail já tem conta. Use \"Entrar\".";
    if (c.includes("weak-password")) return "A senha precisa ter pelo menos 6 caracteres.";
    if (c.includes("popup-blocked") || c.includes("operation-not-supported")) return "O navegador bloqueou a janela. Tentando de outro jeito…";
    if (c.includes("unauthorized-domain")) return "Este endereço ainda não foi autorizado no Firebase (Authentication → Settings → Authorized domains).";
    if (c.includes("network")) return "Sem internet agora. Tente de novo quando conectar.";
    return "Não consegui entrar (" + c + ").";
  };
  return new Promise((resolve) => {
    let ui = null;
    A.onAuthStateChanged(auth, async (u) => {
      if (u) {
        if (ui) ui.close();
        const db = await firebaseEngine(app, u, fs, M);
        db.signOut = () => A.signOut(auth).then(() => location.reload());
        resolve(db);
        return;
      }
      ui = loginUI(
        async () => {
          const prov = new A.GoogleAuthProvider();
          try { await A.signInWithPopup(auth, prov); }
          catch (e) {
            const c = (e && e.code) || "";
            if (c.includes("popup-blocked") || c.includes("operation-not-supported") || c.includes("popup-closed")) { ui.msg(traduz(e)); try { await A.signInWithRedirect(auth, prov); } catch (e2) { ui.msg(traduz(e2)); } }
            else ui.msg(traduz(e));
          }
        },
        async (email, pass, criar) => {
          try { criar ? await A.createUserWithEmailAndPassword(auth, email, pass) : await A.signInWithEmailAndPassword(auth, email, pass); }
          catch (e) { ui.msg(traduz(e)); }
        }
      );
    });
  });
}

// Pede ao Claude: copia o pedido e abre um chat novo já preenchido.
export async function askClaude(prompt) {
  let copied = false;
  try { await navigator.clipboard.writeText(prompt); copied = true; } catch {}
  const url = "https://claude.ai/new?q=" + encodeURIComponent(prompt);
  window.open(url.length < 7500 ? url : "https://claude.ai/new", "_blank", "noopener");
  return { copied, prefilled: url.length < 7500 };
}

export function registerSW(path = "./sw.js") {
  if ("serviceWorker" in navigator && location.protocol !== "file:") {
    window.addEventListener("load", () => navigator.serviceWorker.register(path).catch((e) => console.warn("SW", e)));
  }
}
