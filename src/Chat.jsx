import { useEffect, useRef, useState } from "react";
import { signOut } from "firebase/auth";
import {
  addDoc, arrayUnion, collection, doc, getDocs, onSnapshot,
  orderBy, query, serverTimestamp, updateDoc, where,
} from "firebase/firestore";
import { auth, db } from "./firebase";
import "./Chat.css";

const toDate = (ts) => (ts?.toDate ? ts.toDate() : null);

function timeStr(ts) {
  const d = toDate(ts);
  return d ? d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "";
}

function dayLabel(ts) {
  const d = toDate(ts);
  if (!d) return "Today";
  const t = new Date();
  const y = new Date();
  y.setDate(t.getDate() - 1);
  if (d.toDateString() === t.toDateString()) return "Today";
  if (d.toDateString() === y.toDateString()) return "Yesterday";
  return d.toLocaleDateString([], { day: "numeric", month: "short", year: "numeric" });
}

function listTime(ts) {
  const d = toDate(ts);
  if (!d) return "";
  return d.toDateString() === new Date().toDateString()
    ? timeStr(ts)
    : d.toLocaleDateString([], { day: "numeric", month: "short" });
}

const COLORS = ["#2563eb", "#db2777", "#16a34a", "#d97706", "#7c3aed", "#0891b2"];

function Avatar({ name, small }) {
  const n = name || "?";
  const color = COLORS[n.charCodeAt(0) % COLORS.length];
  return (
    <div className={`avatar ${small ? "small" : ""}`} style={{ background: color }}>
      {n[0].toUpperCase()}
    </div>
  );
}

export default function Chat({ user }) {
  const [rooms, setRooms] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState("");
  const [friendEmail, setFriendEmail] = useState("");
  const [search, setSearch] = useState("");
  const [info, setInfo] = useState("");
  const [, setTick] = useState(0);
  const bottomRef = useRef(null);
  const lastTyping = useRef(0);

  const myName = user.displayName || user.email.split("@")[0];
  const activeRoom = rooms.find((r) => r.id === activeId) || null;

  // Re-render every 1.5s so "typing..." disappears on time
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 1500);
    return () => clearInterval(t);
  }, []);

  // Rooms I belong to
  useEffect(() => {
    const q = query(collection(db, "rooms"), where("members", "array-contains", user.uid));
    return onSnapshot(q, (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      const stamp = (r) => (r.lastMessageAt || r.createdAt)?.seconds || 0;
      list.sort((a, b) => stamp(b) - stamp(a));
      setRooms(list);
    });
  }, [user.uid]);

  // Messages of active room + mark as read
  useEffect(() => {
    if (!activeId) {
      setMessages([]);
      return;
    }
    const q = query(collection(db, `rooms/${activeId}/messages`), orderBy("createdAt"));
    return onSnapshot(q, (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      setMessages(list);
      snap.docs.forEach((d) => {
        const m = d.data();
        if (m.senderId !== user.uid && !(m.readBy || []).includes(user.uid)) {
          updateDoc(d.ref, { readBy: arrayUnion(user.uid) }).catch(() => {});
        }
      });
    });
  }, [activeId, user.uid]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const otherId = (r) => r.members.find((m) => m !== user.uid);
  const title = (r) => r.memberNames?.[otherId(r)] || r.name || "Chat";

  async function startChat(e) {
    e.preventDefault();
    setInfo("");
    const email = friendEmail.trim().toLowerCase();
    if (!email) return;
    if (email === user.email.toLowerCase()) {
      setInfo("That's your own email.");
      return;
    }
    const found = await getDocs(query(collection(db, "users"), where("email", "==", email)));
    if (found.empty) {
      setInfo("No user with that email. They need to sign up first.");
      return;
    }
    const friend = found.docs[0];
    const existing = rooms.find((r) => r.members.includes(friend.id) && r.members.length === 2);
    if (existing) {
      setActiveId(existing.id);
    } else {
      const ref = await addDoc(collection(db, "rooms"), {
        name: friend.data().name,
        memberNames: { [user.uid]: myName, [friend.id]: friend.data().name },
        members: [user.uid, friend.id],
        createdAt: serverTimestamp(),
        lastMessage: "",
        lastMessageAt: serverTimestamp(),
      });
      setActiveId(ref.id);
    }
    setFriendEmail("");
  }

  async function sendMessage(e) {
    e.preventDefault();
    const t = text.trim();
    if (!t || !activeId) return;
    setText("");
    await addDoc(collection(db, `rooms/${activeId}/messages`), {
      text: t,
      senderId: user.uid,
      createdAt: serverTimestamp(),
      readBy: [user.uid],
    });
    await updateDoc(doc(db, "rooms", activeId), {
      lastMessage: t,
      lastSenderId: user.uid,
      lastMessageAt: serverTimestamp(),
      [`typing.${user.uid}`]: 0,
    });
  }

  function handleTyping(value) {
    setText(value);
    const now = Date.now();
    if (activeId && now - lastTyping.current > 2000) {
      lastTyping.current = now;
      updateDoc(doc(db, "rooms", activeId), { [`typing.${user.uid}`]: now }).catch(() => {});
    }
  }

  const isTyping =
    activeRoom && Date.now() - (activeRoom.typing?.[otherId(activeRoom)] || 0) < 4000;

  const shownRooms = rooms.filter((r) =>
    title(r).toLowerCase().includes(search.trim().toLowerCase())
  );

  return (
    <div className={`chat-app ${activeRoom ? "in-chat" : ""}`}>
      <div className="sidebar">
        <div className="side-head">
          <b>Cloud Chat</b>
          <button onClick={() => signOut(auth)}>Logout</button>
        </div>
        <div className="me">{user.email}</div>

        <form className="side-forms" onSubmit={startChat}>
          <input
            type="email"
            placeholder="Friend's email"
            value={friendEmail}
            onChange={(e) => setFriendEmail(e.target.value)}
          />
          <button type="submit">Start chat</button>
        </form>
        {info && <div className="info">{info}</div>}

        <div className="side-forms">
          <input
            placeholder="Search chats"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <div className="room-list">
          {shownRooms.map((r) => (
            <div
              key={r.id}
              className={`room ${activeId === r.id ? "active" : ""}`}
              onClick={() => setActiveId(r.id)}
            >
              <Avatar name={title(r)} />
              <div className="room-body">
                <div className="room-top">
                  <span>{title(r)}</span>
                  <span>{listTime(r.lastMessageAt)}</span>
                </div>
                <div className="room-last">
                  {r.lastMessage
                    ? (r.lastSenderId === user.uid ? "You: " : "") + r.lastMessage
                    : "No messages yet"}
                </div>
              </div>
            </div>
          ))}
          {shownRooms.length === 0 && (
            <p style={{ textAlign: "center", color: "#9ca3af", fontSize: 13 }}>No chats found.</p>
          )}
        </div>
      </div>

      <div className="main">
        {activeRoom ? (
          <>
            <div className="chat-head">
              <button className="back" onClick={() => setActiveId(null)}>←</button>
              <Avatar name={title(activeRoom)} small />
              <div>
                <div className="name">{title(activeRoom)}</div>
                <div className="sub">{isTyping ? "typing..." : ""}</div>
              </div>
            </div>

            <div className="messages">
              {messages.map((m, i) => {
                const mine = m.senderId === user.uid;
                const showDay =
                  i === 0 ||
                  dayLabel(messages[i - 1].createdAt) !== dayLabel(m.createdAt);
                const seen = (m.readBy || []).length > 1;
                return (
                  <div key={m.id}>
                    {showDay && (
                      <div className="day"><span>{dayLabel(m.createdAt)}</span></div>
                    )}
                    <div className={`row ${mine ? "mine" : ""}`}>
                      <div className="bubble">
                        {m.text}
                        <div className="meta">
                          {timeStr(m.createdAt)}{" "}
                          {mine && (
                            <span className={`tick ${seen ? "seen" : ""}`}>
                              {seen ? "✓✓" : "✓"}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
              <div ref={bottomRef} />
            </div>

            <form className="composer" onSubmit={sendMessage}>
              <input
                value={text}
                onChange={(e) => handleTyping(e.target.value)}
                placeholder="Type a message"
              />
              <button type="submit">Send</button>
            </form>
          </>
        ) : (
          <p className="empty">Select or start a chat</p>
        )}
      </div>
    </div>
  );
}