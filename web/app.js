/* 界面：菜单 / 单机 / 联机 */
const $ = (id) => document.getElementById(id);
const RED = "#c8323c", BLACK = "#1c1c22", GOLD = "#e8be5a";

let soloCfg = { players: 4, chips: 1000, bb: 10 };
let hostCfg = { players: 4, chips: 1000, bb: 10, fillAI: true };
let mode = "solo";
let game = null;
let view = null;
let hero = 0;
let mySeat = 0;
let isHost = false;
let roomCode = "";
let aiTimer = null;
let wallet = null;
let tableActive = false;
let tableStarted = false;
let tableCash = 0;
let tableBuyIn = 0;

let profile = null;
let friends = [];
let requests = [];
let presence = {};
let socialMq = null;
let pendingInvites = [];
let pendingFriendReqs = [];
let lastHostMsg = 0;

/* ---------------- 菜单 ---------------- */
function initMenu() { /* 首页静态 */ }

function fillChips(boxId, values, current, fmt, onPick) {
  const box = $(boxId);
  box.innerHTML = "";
  values.forEach((v) => {
    const d = document.createElement("div");
    d.className = "chip" + (v === current ? " on" : "");
    d.textContent = fmt ? fmt(v) : String(v);
    d.onclick = () => onPick(v);
    box.appendChild(d);
  });
}

/* ---------------- 账户 / 钱包 / 签到 ---------------- */
function todayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function fmtMoney(n) {
  return Number(n || 0).toLocaleString("zh-CN");
}

function saveWallet() {
  if (profile && wallet) localStorage.setItem("pokerWallet_" + profile.uid, JSON.stringify(wallet));
}

function loadWallet() {
  if (!profile) return;
  try { wallet = JSON.parse(localStorage.getItem("pokerWallet_" + profile.uid) || "null"); } catch (e) { wallet = null; }
  if (!wallet || typeof wallet.balance !== "number") {
    wallet = { balance: 10000, lastCheckin: "", games: 0 };
    saveWallet();
  }
  renderWallet();
}

function renderWallet() {
  if (!wallet) return;
  const b = fmtMoney(wallet.balance);
  if ($("homeBalance")) $("homeBalance").textContent = "余额 " + b;
  if ($("meBalance")) $("meBalance").textContent = b;
  const done = wallet.lastCheckin === todayKey();
  if ($("checkinBtn")) {
    $("checkinBtn").disabled = done;
    $("checkinBtn").textContent = done ? "今日已签到" : "签到 +5,000";
  }
  if ($("checkinStatus")) $("checkinStatus").textContent = done ? "明天再来" : "每天可领 5,000";
}

function checkIn() {
  if (!wallet) return;
  if (wallet.lastCheckin === todayKey()) { alert("今天已经签到过了"); return; }
  wallet.balance += 5000;
  wallet.lastCheckin = todayKey();
  saveWallet();
  renderWallet();
  alert("签到成功，+5,000");
}

function beginTable(buyIn) {
  if (!wallet) return false;
  buyIn = Number(buyIn) || 0;
  if (buyIn < 1) return true;
  if (wallet.balance < buyIn) {
    alert(`账户余额不足：带入需要 ${fmtMoney(buyIn)}，当前余额 ${fmtMoney(wallet.balance)}`);
    return false;
  }
  wallet.balance -= buyIn;
  saveWallet();
  tableActive = true;
  tableStarted = false;
  tableCash = wallet.balance;
  tableBuyIn = buyIn;
  renderWallet();
  return true;
}

function syncTable(stack, force) {
  if (!tableActive || !wallet) return;
  if (!tableStarted && !force) return;
  const n = tableCash + Math.max(0, Number(stack) || 0);
  if (n !== wallet.balance) {
    wallet.balance = n;
    saveWallet();
    renderWallet();
  }
}

function endTable(stack) {
  if (!tableActive) return;
  syncTable(tableStarted ? stack : tableBuyIn, true);
  tableActive = false;
  tableStarted = false;
  tableCash = 0;
  tableBuyIn = 0;
  saveWallet();
  renderWallet();
}

function heroStackWithBet() {
  if (mode === "solo" && game && game.players[hero]) {
    return (game.players[hero].stack || 0) + (game.players[hero].bet || 0);
  }
  if (view && view.players) {
    const p = view.players[mode === "solo" ? hero : mySeat];
    if (p) return (p.stack || 0) + (p.bet || 0);
  }
  return 0;
}

function syncTableFromView() {
  if (!tableActive || !view) return;
  if (view.phase === "over" || view.phase === "gameover") syncTable(heroStackWithBet());
}

function switchTab(tab) {
  const map = { home: "menu", friends: "friendsScreen", me: "meScreen" };
  Object.values(map).forEach((id) => { const el = $(id); if (el) el.classList.add("hidden"); });
  const target = $(map[tab] || "menu");
  if (target) target.classList.remove("hidden");
  document.querySelectorAll("#tabbar .tab").forEach((b) => {
    b.classList.toggle("on", b.getAttribute("data-tab") === tab);
  });
  if (tab === "me") renderWallet();
}


function renderSoloSetup() {
  fillChips("soloPlayers", [2, 3, 4, 5, 6, 7, 8, 9], soloCfg.players, (v) => v + " 人", (v) => { soloCfg.players = v; renderSoloSetup(); });
  fillChips("soloChips", [500, 1000, 2000, 5000], soloCfg.chips, (v) => String(v), (v) => { soloCfg.chips = v; renderSoloSetup(); });
  fillChips("soloBB", [10, 20, 50, 100], soloCfg.bb, (v) => "大盲 " + v, (v) => { soloCfg.bb = v; renderSoloSetup(); });
}

function openSoloSetup() {
  renderSoloSetup();
  $("soloSetup").classList.remove("hidden");
}

function startSoloFromSetup() {
  $("soloSetup").classList.add("hidden");
  startSolo();
}

function renderHostSetup() {
  fillChips("hostPlayers", [2, 3, 4, 5, 6, 7, 8, 9], hostCfg.players, (v) => v + " 人", (v) => { hostCfg.players = v; renderHostSetup(); });
  fillChips("hostChips", [500, 1000, 2000, 5000], hostCfg.chips, (v) => String(v), (v) => { hostCfg.chips = v; renderHostSetup(); });
  fillChips("hostBB", [10, 20, 50, 100], hostCfg.bb, (v) => "大盲 " + v, (v) => { hostCfg.bb = v; renderHostSetup(); });
  $("hostFillAI").checked = !!hostCfg.fillAI;
}

function openHostSetup() {
  renderHostSetup();
  $("hostSetup").classList.remove("hidden");
}

function createHostFromSetup() {
  $("hostSetup").classList.add("hidden");
  createRoom(null, Object.assign({}, hostCfg));
}

function openJoinSetup() {
  $("joinCode").value = "";
  $("joinSetup").classList.remove("hidden");
  setTimeout(() => { try { $("joinCode").focus(); } catch (e) {} }, 100);
}

function joinFromSetup() {
  const code = parseRoomCode($("joinCode").value);
  if (!code) { alert("请输入 6 位房间码"); return; }
  $("joinSetup").classList.add("hidden");
  joinRoom(code);
}

function nick() {
  return (profile && profile.name) ? profile.name : "玩家";
}

function genUid() {
  const abc = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let s = "";
  for (let i = 0; i < 8; i++) s += abc[Math.floor(Math.random() * abc.length)];
  return s;
}

function loadProfile() {
  try { profile = JSON.parse(localStorage.getItem("pokerProfile") || "null"); } catch (e) { profile = null; }
  if (profile && profile.uid && profile.name) {
    if (!profile.avatar) profile.avatar = "";
    applyProfile();
  } else {
    $("login").classList.remove("hidden");
  }
}

function avatarHtml(p, big) {
  const cls = "avatar" + (big ? " big" : "");
  if (p && p.avatar) return `<img class="${cls}" src="${p.avatar}" alt="">`;
  const ch = (p && p.name ? p.name[0] : "?").toUpperCase();
  return `<span class="${cls}">${escapeHtml(ch)}</span>`;
}

function applyProfile() {
  $("myAvatar").innerHTML = avatarHtml(profile, true);
  $("myName").textContent = profile.name;
  $("myUid").textContent = profile.uid;
  $("login").classList.add("hidden");
  $("tabbar").classList.remove("hidden");
  switchTab("home");
  loadWallet();
  loadFriends();
  loadRequests();
  socialConnect();
}

function login() {
  const name = (($("loginName").value || "").trim() || ("玩家" + Math.floor(Math.random() * 9000 + 1000))).slice(0, 10);
  profile = { uid: genUid(), name, avatar: "" };
  localStorage.setItem("pokerProfile", JSON.stringify(profile));
  applyProfile();
}

function setAvatarFile(file) {
  if (!file) return;
  const img = new Image();
  const url = URL.createObjectURL(file);
  img.onload = () => {
    const c = document.createElement("canvas");
    c.width = 96; c.height = 96;
    const ctx = c.getContext("2d");
    const s = Math.min(img.width, img.height);
    ctx.drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, 96, 96);
    profile.avatar = c.toDataURL("image/jpeg", 0.72);
    localStorage.setItem("pokerProfile", JSON.stringify(profile));
    $("myAvatar").innerHTML = avatarHtml(profile, true);
    $("avatarFile").value = "";
    publishPresence(false);
    if (host && host.players.get(0)) {
      host.players.get(0).avatar = profile.avatar;
      publishRoom();
      if (host.game) hostRender();
    }
    if (mode === "online" && !isHostMode && mq && roomCode) {
      mq.publish(TOPIC(roomCode, "join"), JSON.stringify({ id: myId, name: nick(), avatar: profile.avatar }), { qos: 1 });
    }
    if (view) render();
    setSocialStatus("头像已更新");
    renderFriends();
    URL.revokeObjectURL(url);
  };
  img.src = url;
}

function logout() {
  if (!confirm("切换账号会退出当前登录，好友列表按账号保存。继续？")) return;
  localStorage.removeItem("pokerProfile");
  if (socialMq) { try { socialMq.end(true); } catch (e) {} }
  socialMq = null; profile = null; friends = []; requests = []; presence = {};
  location.reload();
}

/* ---------------- 好友 / 在线状态（公共 MQTT） ---------------- */
const USER_TOPIC = (uid, part) => `dafeiyu/pk/v1/user/${uid}/${part}`;

function setSocialStatus(t) {
  const el = $("socialStatus");
  if (el) el.textContent = t;
}

function socialConnect() {
  if (!profile) return;
  if (socialMq) { try { socialMq.end(true); } catch (e) {} }
  setSocialStatus("好友服务连接中…");
  socialMq = mqtt.connect(MQTT_URL, {
    clientId: "s-" + profile.uid,
    clean: true,
    reconnectPeriod: 3000,
    keepalive: 30,
    will: {
      topic: USER_TOPIC(profile.uid, "presence"),
      payload: JSON.stringify({ name: profile.name, avatar: profile.avatar || "", ts: 0, offline: true }),
      qos: 1, retain: true,
    },
  });
  socialMq.on("connect", () => {
    setSocialStatus("好友服务已连接");
    socialMq.subscribe([
      USER_TOPIC(profile.uid, "invite"),
      USER_TOPIC(profile.uid, "presence"),
      USER_TOPIC(profile.uid, "friendreq/+"),
      USER_TOPIC(profile.uid, "friendack/+"),
      USER_TOPIC(profile.uid, "friendrej/+"),
    ], { qos: 1 });
    if (!socialMq.__bound) {
      socialMq.on("message", onSocialMessage);
      socialMq.__bound = true;
    }
    publishPresence(false);
    subscribeFriendPresence();
    const queued = pendingFriendReqs.slice();
    pendingFriendReqs = [];
    queued.forEach((q) => socialMq.publish(USER_TOPIC(q.uid, "friendreq/" + profile.uid), JSON.stringify(q.payload), { qos: 1, retain: true }));
  });
  socialMq.on("reconnect", () => setSocialStatus("好友服务重连中…"));
  socialMq.on("close", () => setSocialStatus("好友服务断开，正在重连…"));
  socialMq.on("error", (e) => setSocialStatus("好友服务错误：" + (e && e.message ? e.message : e)));
}

function publishPresence(offline) {
  if (!socialMq || !socialMq.connected || !profile) return;
  socialMq.publish(USER_TOPIC(profile.uid, "presence"),
    JSON.stringify({ name: profile.name, avatar: profile.avatar || "", ts: offline ? 0 : Date.now(), offline: !!offline }),
    { qos: 1, retain: true });
}

function onSocialMessage(topic, payload) {
  const raw = payload ? payload.toString() : "";
  if (!raw) return;
  let m;
  try { m = JSON.parse(raw); } catch (e) { return; }
  if (topic.endsWith("/invite")) {
    if (!m.code) return;
    if (confirm(`${m.from || "好友"} 邀请你加入房间 ${m.code}，现在加入吗？`)) {
      if (mode === "online") leaveTable();
      joinRoom(m.code);
    }
  } else if (topic.includes("/friendreq/")) {
    const uid = topic.split("/").pop();
    if (!uid || uid === profile.uid) return;
    if (friends.some((f) => f.uid === uid)) return;
    const item = { uid, name: m.name || uid, avatar: m.avatar || "" };
    const idx = requests.findIndex((r) => r.uid === uid);
    if (idx >= 0) requests[idx] = item; else requests.push(item);
    saveRequests();
    renderRequests();
    setSocialStatus(`${item.name} 请求加你为好友`);
  } else if (topic.includes("/friendack/")) {
    const uid = topic.split("/").pop();
    if (!uid) return;
    if (!friends.some((f) => f.uid === uid)) {
      friends.push({ uid, name: m.name || uid, avatar: m.avatar || "" });
      saveFriends();
    }
    subscribeFriendPresence();
    renderFriends();
    setSocialStatus(`${m.name || uid} 同意了你的好友申请`);
  } else if (topic.includes("/friendrej/")) {
    setSocialStatus("对方拒绝了你的好友申请");
  } else if (topic.endsWith("/presence")) {
    const uid = topic.split("/")[4];
    if (!uid) return;
    presence[uid] = m;
    const f = friends.find((x) => x.uid === uid);
    if (f && (f.name !== m.name || f.avatar !== m.avatar)) {
      f.name = m.name || f.name;
      f.avatar = m.avatar || f.avatar;
      saveFriends();
    }
    renderFriends();
  }
}

function subscribeFriendPresence() {
  if (!socialMq || !socialMq.connected) return;
  const topics = friends.map((f) => USER_TOPIC(f.uid, "presence"));
  if (topics.length) socialMq.subscribe(topics, { qos: 1 });
}

function isOnline(uid) {
  const p = presence[uid];
  return !!(p && !p.offline && p.ts && Date.now() - p.ts < 90000);
}

function loadFriends() {
  try { friends = JSON.parse(localStorage.getItem("pokerFriends_" + profile.uid) || "[]"); } catch (e) { friends = []; }
  renderFriends();
}

function saveFriends() {
  if (profile) localStorage.setItem("pokerFriends_" + profile.uid, JSON.stringify(friends));
}

function addFriend() {
  const uid = ($("friendUid").value || "").trim().toUpperCase();
  if (!/^[A-Z0-9]{6,12}$/.test(uid)) { setSocialStatus("好友 ID 格式不对（6~12 位字母数字）"); return; }
  if (uid === profile.uid) { setSocialStatus("不能加自己"); return; }
  if (friends.some((f) => f.uid === uid)) { setSocialStatus("已经加过了"); return; }
  const payload = { t: "friendreq", uid: profile.uid, name: profile.name, avatar: profile.avatar || "" };
  if (!socialMq || !socialMq.connected) {
    pendingFriendReqs.push({ uid, payload });
    $("friendUid").value = "";
    setSocialStatus("好友服务连接中，连上后会自动发送申请");
    return;
  }
  socialMq.publish(USER_TOPIC(uid, "friendreq/" + profile.uid), JSON.stringify(payload), { qos: 1, retain: true });
  $("friendUid").value = "";
  setSocialStatus("好友申请已发送，等对方同意");
}

function loadRequests() {
  try { requests = JSON.parse(localStorage.getItem("pokerRequests_" + profile.uid) || "[]"); } catch (e) { requests = []; }
  renderRequests();
}

function saveRequests() {
  if (profile) localStorage.setItem("pokerRequests_" + profile.uid, JSON.stringify(requests));
}

function renderRequests() {
  const box = $("requestList");
  if (!box) return;
  if (!requests.length) { box.innerHTML = '<p class="hint">没有待处理的好友申请。</p>'; return; }
  box.innerHTML = requests.map((r) => `<div class="friend">
      ${avatarHtml(r)}
      <span class="name">${escapeHtml(r.name || r.uid)}<br><span class="uid">${r.uid}</span></span>
      <button data-ok="${r.uid}">同意</button>
      <button data-no="${r.uid}">拒绝</button>
    </div>`).join("");
  box.querySelectorAll("[data-ok]").forEach((b) => { b.onclick = () => acceptRequest(b.getAttribute("data-ok")); });
  box.querySelectorAll("[data-no]").forEach((b) => { b.onclick = () => rejectRequest(b.getAttribute("data-no")); });
}

function acceptRequest(uid) {
  const r = requests.find((x) => x.uid === uid);
  if (!r) return;
  if (!friends.some((f) => f.uid === uid)) {
    friends.push({ uid, name: r.name || uid, avatar: r.avatar || "" });
    saveFriends();
  }
  if (socialMq && socialMq.connected) {
    socialMq.publish(USER_TOPIC(uid, "friendack/" + profile.uid),
      JSON.stringify({ t: "friendack", uid: profile.uid, name: profile.name, avatar: profile.avatar || "" }),
      { qos: 1, retain: true });
    socialMq.publish(USER_TOPIC(profile.uid, "friendreq/" + uid), "", { qos: 1, retain: true });
  }
  requests = requests.filter((x) => x.uid !== uid);
  saveRequests();
  renderRequests();
  subscribeFriendPresence();
  renderFriends();
  setSocialStatus("已同意，双方成为好友");
}

function rejectRequest(uid) {
  if (socialMq && socialMq.connected) {
    socialMq.publish(USER_TOPIC(profile.uid, "friendreq/" + uid), "", { qos: 1, retain: true });
    socialMq.publish(USER_TOPIC(uid, "friendrej/" + profile.uid), JSON.stringify({ uid: profile.uid }), { qos: 0 });
  }
  requests = requests.filter((x) => x.uid !== uid);
  saveRequests();
  renderRequests();
  setSocialStatus("已拒绝");
}

function removeFriend(uid) {
  friends = friends.filter((f) => f.uid !== uid);
  saveFriends();
  renderFriends();
}

function inviteFriend(uid) {
  const name = (presence[uid] && presence[uid].name) || uid;
  if (!isHostMode || !host) {
    pendingInvites.push(uid);
    createRoom();
    setNetStatus("房间已建好，正在邀请 " + name + "…");
    return;
  }
  sendInvite(uid);
}

function sendInvite(uid) {
  if (!socialMq || !socialMq.connected) { setNetStatus("好友服务没连上，稍后再试"); return; }
  socialMq.publish(USER_TOPIC(uid, "invite"), JSON.stringify({ t: "invite", code: roomCode, from: profile.name }), { qos: 1 });
  setNetStatus(`已邀请 ${(presence[uid] && presence[uid].name) || uid}，等对方确认…`);
}

function renderFriends() {
  const box = $("friendList");
  if (!box) return;
  if (!friends.length) { box.innerHTML = '<p class="hint">还没有好友，输入对方 ID 添加。</p>'; return; }
  box.innerHTML = friends.map((f) => {
    const p = presence[f.uid] || {};
    const name = p.name || f.name || f.uid;
    const av = p.avatar || f.avatar || "";
    const on = isOnline(f.uid);
    return `<div class="friend">
      ${avatarHtml({ name, avatar: av })}
      <span class="dot ${on ? "on" : ""}"></span>
      <span class="name">${escapeHtml(name)}<br><span class="uid">${f.uid}</span></span>
      <button data-invite="${f.uid}">邀请</button>
      <button data-del="${f.uid}">删</button>
    </div>`;
  }).join("");
  box.querySelectorAll("[data-invite]").forEach((b) => { b.onclick = () => inviteFriend(b.getAttribute("data-invite")); });
  box.querySelectorAll("[data-del]").forEach((b) => { b.onclick = () => removeFriend(b.getAttribute("data-del")); });
}

function renderPickList() {
  const box = $("pickList");
  box.innerHTML = friends.length ? friends.map((f) => {
    const p = presence[f.uid] || {};
    const name = p.name || f.name || f.uid;
    const on = isOnline(f.uid);
    return `<div class="friend">
      ${avatarHtml({ name, avatar: p.avatar || f.avatar || "" })}
      <span class="dot ${on ? "on" : ""}"></span>
      <span class="name">${escapeHtml(name)}<br><span class="uid">${f.uid}</span></span>
      <button data-pick="${f.uid}">邀请</button>
    </div>`;
  }).join("") : '<p class="hint">还没有好友，先回菜单添加。</p>';
  box.querySelectorAll("[data-pick]").forEach((b) => {
    b.onclick = () => { sendInvite(b.getAttribute("data-pick")); $("friendPick").classList.add("hidden"); };
  });
}

/* 每 20 秒发一次在线心跳，好友列表每 5 秒刷新一次离线状态 */
setInterval(() => publishPresence(false), 20000);
setInterval(renderFriends, 5000);
window.addEventListener("beforeunload", () => publishPresence(true));

function setNetStatus(t) {
  $("netStatus").textContent = t;
  const sb = $("statusBar");
  if (sb) sb.textContent = t;
}

/* ---------------- 单机 ---------------- */
function startSolo() {
  mode = "solo";
  hero = 0;
  const cfg = soloCfg;
  if (!beginTable(cfg.chips)) return;
  tableStarted = true;
  const names = ["你", "电脑A", "电脑B", "电脑C", "电脑D", "电脑E", "电脑F", "电脑G", "电脑H"];
  const players = names.slice(0, cfg.players).map((n, i) => ({ name: i === 0 ? nick() : n, stack: cfg.chips, ai: i !== 0 }));
  game = new Game(players, Math.floor(cfg.bb / 2), cfg.bb);
  game.startHand();
  view = buildView();
  showTable();
  scheduleAI();
}

function buildView() {
  const g = game;
  const legal = g.actor === hero && ["preflop", "flop", "turn", "river"].includes(g.phase) ? g.legal(hero) : null;
  return {
    players: g.players.map((p, i) => ({
      name: p.name, stack: p.stack, bet: p.bet, folded: p.folded, allin: p.allin,
      last: p.last,
      avatar: i === hero ? ((profile && profile.avatar) || "") : "",
      hole: i === hero || g.phase === "over" || g.phase === "gameover" ? p.hole.map(cardText) : null,
      holeRaw: p.hole,
    })),
    board: g.board.map(cardText),
    pot: g.potTotal(),
    phase: g.phase,
    actor: g.actor,
    button: g.button,
    results: g.results,
    log: g.log.slice(-30),
    legal,
    handNo: g.handNo,
  };
}

function scheduleAI() {
  clearTimeout(aiTimer);
  if (!game || game.phase === "over" || game.phase === "gameover") return;
  const p = game.players[game.actor];
  if (!p || !p.ai) return;
  aiTimer = setTimeout(() => {
    if (!game || game.phase === "over" || game.phase === "gameover") return;
    const idx = game.actor;
    if (!game.players[idx] || !game.players[idx].ai) return;
    const [a, amt] = aiDecide(game, idx);
    game.act(idx, a, amt);
    afterLocalAction();
  }, 520);
}

function afterLocalAction() {
  view = buildView();
  render();
  if (game.phase === "over" || game.phase === "gameover") {
    showOverlay();
  } else {
    scheduleAI();
  }
}

function doAction(a) {
  if (mode === "solo") {
    if (!game || game.actor !== hero) return;
    let amt = 0;
    if (a === "raise") amt = parseInt($("raise").value || "0");
    game.act(hero, a, amt);
    afterLocalAction();
  } else if (isHostMode) {
    if (!host || !host.game || host.game.actor !== 0) return;
    const amt = a === "raise" ? parseInt($("raise").value || "0") : 0;
    if (host.game.act(0, a, amt)) hostRender();
  } else {
    if (!mq) return;
    const msg = { id: myId, a };
    if (a === "raise") msg.amt = parseInt($("raise").value || "0");
    mq.publish(TOPIC(roomCode, "action"), JSON.stringify(msg), { qos: 1 });
  }
}

function nextHand() {
  hideOverlay();
  if (mode === "solo") {
    if (!game) return;
    game.startHand();
    if (game.phase === "gameover") { showOverlay(); return; }
    view = buildView();
    render();
    scheduleAI();
  } else if (isHostMode) {
    hostNextHand();
  }
}

/* ---------------- 渲染 ---------------- */
let canvas, ctx;

function showTable() {
  ["menu", "friendsScreen", "meScreen"].forEach((id) => { const el = $(id); if (el) el.classList.add("hidden"); });
  $("tabbar").classList.add("hidden");
  $("tableScreen").classList.remove("hidden");
  $("roomInfo").textContent = mode === "solo" ? `单机 · ${soloCfg.players} 人` : `房间 ${roomCode} · ${isHost ? "房主" : "玩家"}`;
  canvas = $("table");
  ctx = canvas.getContext("2d");
  resize();
  render();
}

function resize() {
  if (!canvas) return;
  const wrap = $("canvasWrap");
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = Math.max(300, wrap.clientWidth) * dpr;
  canvas.height = Math.max(300, wrap.clientHeight) * dpr;
  canvas.style.width = wrap.clientWidth + "px";
  canvas.style.height = wrap.clientHeight + "px";
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  if (view) render();
}

function seatPositions(n, W, H) {
  const cx = W / 2, cy = H * 0.5;
  const rx = W * 0.36, ry = H * 0.35;
  const pos = [[cx, H * 0.88]];
  if (n === 2) pos.push([cx, H * 0.1]);
  else if (n === 3) pos.push([W * 0.16, H * 0.26], [W * 0.84, H * 0.26]);
  else if (n === 4) pos.push([W * 0.1, H * 0.5], [cx, H * 0.1], [W * 0.9, H * 0.5]);
  else {
    for (let i = 1; i < n; i++) {
      const a = (90 + (i * 360) / n) * Math.PI / 180;
      pos.push([cx + rx * Math.cos(a), cy + ry * Math.sin(a)]);
    }
  }
  return pos;
}

function roundRect(x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawCard(x, y, w, h, text, faceDown = false) {
  if (faceDown) {
    ctx.fillStyle = "#1f3f78"; roundRect(x, y, w, h, 5); ctx.fill();
    ctx.strokeStyle = "#c8d4e8"; ctx.lineWidth = 1; ctx.stroke();
    return;
  }
  ctx.fillStyle = "#f7f6ef"; roundRect(x, y, w, h, 5); ctx.fill();
  ctx.strokeStyle = "#3a3a3a"; ctx.lineWidth = 1; ctx.stroke();
  const rawRank = text.slice(0, -1);
  const rank = rawRank === "T" ? "10" : rawRank;
  const suit = text.slice(-1);
  const color = suit === "♥" || suit === "♦" ? RED : BLACK;
  ctx.fillStyle = color;
  ctx.font = `bold ${Math.floor(h * (rank.length > 1 ? 0.27 : 0.34))}px "Microsoft YaHei", sans-serif`;
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  ctx.fillText(rank, x + w * 0.1, y + h * 0.05);
  ctx.font = `${Math.floor(h * 0.42)}px "Segoe UI Symbol","Microsoft YaHei",sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(suit, x + w / 2, y + h * 0.66);
}

const avatarCache = {};

function avatarRecord(url) {
  if (!url) return null;
  if (avatarCache[url]) return avatarCache[url];
  const img = new Image();
  const rec = { img, ready: false };
  img.onload = () => { rec.ready = true; if (view) render(); };
  img.onerror = () => { rec.ready = false; };
  img.src = url;
  avatarCache[url] = rec;
  return rec;
}

function drawAvatar(cx, cy, r, url, name) {
  const rec = url ? avatarRecord(url) : null;
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.closePath();
  ctx.clip();
  if (rec && rec.ready && rec.img.complete) {
    ctx.drawImage(rec.img, cx - r, cy - r, r * 2, r * 2);
  } else {
    ctx.fillStyle = "#2f6f52";
    ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
    ctx.fillStyle = "#fff";
    ctx.font = `bold ${Math.floor(r * 1.1)}px "Microsoft YaHei",sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(((name || "?")[0] || "?").toUpperCase(), cx, cy);
  }
  ctx.restore();
  ctx.strokeStyle = "#3a5a4b";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.stroke();
}

function render() {
  if (!ctx || !view) return;
  const W = canvas.clientWidth, H = canvas.clientHeight;
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = "#0b1512";
  ctx.fillRect(0, 0, W, H);

  // 牌桌
  ctx.fillStyle = "#135c40";
  roundRect(W * 0.03, H * 0.04, W * 0.94, H * 0.92, Math.min(W, H) * 0.14);
  ctx.fill();
  ctx.strokeStyle = "#0a3a28"; ctx.lineWidth = 6; ctx.stroke();
  ctx.fillStyle = "#1a7a56";
  ctx.beginPath();
  ctx.ellipse(W / 2, H * 0.5, W * 0.33, H * 0.34, 0, 0, Math.PI * 2);
  ctx.fill();

  const n = view.players.length;
  const pos = seatPositions(n, W, H);
  const bw = Math.min(150, Math.max(86, W * 0.22));
  const bh = Math.min(52, Math.max(40, H * 0.09));
  const cw = Math.min(52, Math.max(26, W * 0.052));
  const ch = cw * 1.4;

  // 公共牌
  const gap = cw * 0.12;
  const totalW = 5 * cw + 4 * gap;
  const bx = W / 2 - totalW / 2;
  const by = H * 0.5 - ch / 2;
  for (let i = 0; i < 5; i++) {
    const x = bx + i * (cw + gap);
    if (i < view.board.length) drawCard(x, by, cw, ch, view.board[i]);
    else {
      ctx.fillStyle = "#17674a"; roundRect(x, by, cw, ch, 5); ctx.fill();
      ctx.strokeStyle = "#2c8a63"; ctx.lineWidth = 1; ctx.stroke();
    }
  }
  ctx.fillStyle = GOLD;
  ctx.font = `bold ${Math.max(14, Math.min(22, W * 0.022))}px "Microsoft YaHei",sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(`底池 ${view.pot}`, W / 2, H * 0.5 - ch * 0.9);

  const phaseCn = { preflop: "翻牌前", flop: "翻牌", turn: "转牌", river: "河牌", over: "本手结束", gameover: "游戏结束" };
  ctx.fillStyle = "#cfe0d6";
  ctx.font = `${Math.max(11, Math.min(16, W * 0.016))}px "Microsoft YaHei",sans-serif`;
  ctx.fillText(phaseCn[view.phase] || "", W / 2, H * 0.5 + ch * 0.85);

  // 座位
  for (let i = 0; i < n; i++) {
    const p = view.players[i];
    const [rx0, ry0] = pos[i];
    const px = Math.max(bw / 2 + 4, Math.min(W - bw / 2 - 4, rx0));
    const py = Math.max(bh / 2 + ch + 12, Math.min(H - bh / 2 - 24, ry0));
    const bx0 = px - bw / 2, by0 = py - bh / 2;
    ctx.fillStyle = i === view.actor && ["preflop", "flop", "turn", "river"].includes(view.phase) ? "#2c5a45" : "#173027";
    roundRect(bx0, by0, bw, bh, 8); ctx.fill();
    ctx.strokeStyle = "#3a5a4b"; ctx.lineWidth = 1; ctx.stroke();
    const ar = Math.max(9, Math.min(13, bh * 0.22));
    drawAvatar(bx0 + 6 + ar, by0 + bh / 2, ar, p.avatar || "", p.name);
    const textX = bx0 + 6 + ar * 2 + 6;
    ctx.fillStyle = p.folded ? "#7b8a80" : "#f2f2ea";
    ctx.font = `bold ${Math.max(10, Math.min(14, bw * 0.12))}px "Microsoft YaHei",sans-serif`;
    ctx.textAlign = "left"; ctx.textBaseline = "top";
    ctx.fillText(p.name, textX, by0 + 5);
    ctx.fillStyle = GOLD;
    ctx.font = `${Math.max(10, Math.min(14, bw * 0.12))}px "Microsoft YaHei",sans-serif`;
    ctx.fillText(String(p.stack), textX, by0 + bh * 0.52);

    // 手牌
    if (p.hole) {
      const tw = Math.min(cw, (bw - 10) / 2 - 2);
      const th = tw * 1.4;
      const hx = px - tw - 2, hy = by0 - th - 4;
      drawCard(hx, hy, tw, th, p.hole[0]);
      drawCard(hx + tw + 4, hy, tw, th, p.hole[1]);
    } else if (!p.folded) {
      const tw = Math.min(cw, (bw - 10) / 2 - 2);
      const th = tw * 1.4;
      const hx = px - tw - 2, hy = by0 - th - 4;
      drawCard(hx, hy, tw, th, "", true);
      drawCard(hx + tw + 4, hy, tw, th, "", true);
    }

    if (view.button === i) {
      ctx.fillStyle = "#f2f2ea";
      ctx.beginPath(); ctx.arc(bx0 + bw - 10, by0 + 10, 8, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#111"; ctx.font = "bold 10px sans-serif";
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText("D", bx0 + bw - 10, by0 + 10);
    }
    if (p.bet > 0 && !p.folded) {
      ctx.fillStyle = "#ffe680";
      ctx.font = `${Math.max(9, Math.min(13, bw * 0.11))}px "Microsoft YaHei",sans-serif`;
      ctx.textAlign = "center"; ctx.textBaseline = "top";
      ctx.fillText(`下注 ${p.bet}`, px, py + bh / 2 + 3);
    }
    if (p.last) {
      ctx.fillStyle = "#bfe0c8";
      ctx.font = `${Math.max(9, Math.min(12, bw * 0.1))}px "Microsoft YaHei",sans-serif`;
      ctx.textAlign = "center"; ctx.textBaseline = "top";
      ctx.fillText(p.last, px, py + bh / 2 + 20);
    }
  }

  renderActions();
  renderLog();
  syncTableFromView();
}

function renderActions() {
  const active = ["preflop", "flop", "turn", "river"].includes(view.phase);
  const legal = view.legal;
  const turn = !!legal;
  $("foldBtn").disabled = !turn;
  $("callBtn").disabled = !turn;
  $("raiseBtn").disabled = !turn || !legal.raise;
  $("allinBtn").disabled = !turn;
  $("raise").disabled = !turn || !legal.raise;
  if (legal) {
    $("callBtn").textContent = legal.check ? "过牌" : `跟注 ${legal.call_amount}`;
    const sl = $("raise");
    sl.min = legal.min_raise_to;
    sl.max = legal.max_raise_to;
    if (+sl.value < +sl.min || +sl.value > +sl.max) sl.value = sl.min;
    $("raiseVal").textContent = sl.value;
  } else {
    $("callBtn").textContent = "过牌";
    $("raiseVal").textContent = "—";
  }
}

function renderLog() {
  const box = $("logBox");
  box.innerHTML = view.log.map((l) => `<div>${escapeHtml(l)}</div>`).join("");
  box.scrollTop = box.scrollHeight;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function showOverlay() {
  if (!view) return;
  $("overlay").classList.remove("hidden");
  $("overlayTitle").textContent = view.phase === "gameover" ? "游戏结束" : "本手结束";
  let text = (view.results || []).map((r) => `<div>${escapeHtml(r)}</div>`).join("");
  if (view.phase === "gameover") {
    const best = view.players.reduce((a, b) => (a.stack >= b.stack ? a : b));
    text += `<div style="color:#e8be5a;margin-top:10px">最终赢家：${escapeHtml(best.name)}（${best.stack}）</div>`;
  }
  $("overlayText").innerHTML = text;
  const btn = $("nextBtn");
  if (mode === "online") {
    if (view.phase === "gameover") {
      btn.disabled = false;
      btn.textContent = "返回菜单";
    } else {
      btn.disabled = !isHost;
      btn.textContent = isHost ? "下一手" : "等待房主开始下一手";
    }
  } else {
    btn.disabled = false;
    btn.textContent = view.phase === "gameover" ? "返回菜单" : "下一手";
  }
}

function hideOverlay() { $("overlay").classList.add("hidden"); }

/* ---------------- 联机（公共 MQTT 中继，免开服/免内网穿透） ---------------- */
const MQTT_URL = "wss://broker.emqx.io:8084/mqtt";
const TOPIC = (code, part) => `dafeiyu/pk/v1/${code}/${part}`;
let mq = null, isHostMode = false, host = null, joinTimer = null;
let myId = localStorage.getItem("pokerClientId");
if (!myId) {
  myId = "p" + Math.random().toString(36).slice(2, 10);
  localStorage.setItem("pokerClientId", myId);
}

function genCode() {
  const abc = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let s = "";
  for (let i = 0; i < 6; i++) s += abc[Math.floor(Math.random() * abc.length)];
  return s;
}

function parseRoomCode(raw) {
  const s = String(raw || "").toUpperCase();
  const m = s.match(/[A-Z0-9]{6}/);
  return m ? m[0] : "";
}

function mqttConnect(onready) {
  if (mq) { try { mq.end(true); } catch (e) {} }
  setNetStatus("连接联机服务（broker.emqx.io）…");
  mq = mqtt.connect(MQTT_URL, {
    clientId: myId, clean: true, reconnectPeriod: 3000, connectTimeout: 8000, keepalive: 30,
  });
  mq.on("connect", () => { setNetStatus("联机服务已连接"); onready(); });
  mq.on("reconnect", () => setNetStatus("联机服务重连中…"));
  mq.on("close", () => setNetStatus("联机服务断开，正在自动重连…"));
  mq.on("error", (e) => setNetStatus("联机服务错误：" + (e && e.message ? e.message : e)));
}

function createRoom(code, cfg) {
  mode = "online"; isHost = true; isHostMode = true; hero = 0;
  roomCode = (typeof code === "string" && code ? code : genCode()).toUpperCase();
  const conf = Object.assign({ players: 4, chips: 1000, bb: 10, fillAI: true }, cfg || hostCfg);
  host = {
    players: new Map([[0, { id: myId, name: nick(), avatar: (profile && profile.avatar) || "" }]]),
    seatOf: new Map([[myId, 0]]),
    game: null,
    started: false,
    roomTimer: null,
    aiTimer: null,
    config: conf,
  };
  $("menu").classList.add("hidden");
  $("tableScreen").classList.remove("hidden");
  if (!canvas) showTable();
  $("roomInfo").textContent = `房间 ${roomCode} · 连接中…`;
  $("copyBtn").classList.remove("hidden");
  $("startBtn").classList.add("hidden");
  $("inviteBtn").classList.remove("hidden");
  renderWaiting({ players: [{ name: nick(), avatar: (profile && profile.avatar) || "" }], chips: conf.chips });
  mqttConnect(() => {
    $("roomInfo").textContent = `房间 ${roomCode} · 房主 · ${conf.players}人`;
    $("startBtn").classList.remove("hidden");
    setNetStatus(`已连接。房间 ${roomCode}（${conf.players}人，${conf.chips}筹码，大盲${conf.bb}），可邀请好友或等朋友输入房间码`);
    view.log = [`房间码 ${roomCode}，${conf.players}人局，等待朋友加入…`];
    renderLog();
    mq.subscribe([TOPIC(roomCode, "join"), TOPIC(roomCode, "action"), TOPIC(roomCode, "leave")], { qos: 1 });
    if (!mq.__hostBound) {
      mq.on("message", onHostMessage);
      mq.__hostBound = true;
    }
    if (host.roomTimer) clearInterval(host.roomTimer);
    host.roomTimer = setInterval(publishRoom, 3000);
    publishRoom();
    const waiting = pendingInvites.slice();
    pendingInvites = [];
    waiting.forEach((uid) => sendInvite(uid));
  });
}

function publishRoom() {
  if (!mq || !host) return;
  const players = [...host.players.entries()].map(([seat, p]) => ({ seat, name: p.name, id: p.id, avatar: p.avatar || "" }));
  mq.publish(TOPIC(roomCode, "room"), JSON.stringify({
    t: "room", code: roomCode, started: host.started, players,
    chips: host.config ? host.config.chips : 1000,
    bb: host.config ? host.config.bb : 10,
  }), { qos: 1 });
}

function onHostMessage(topic, payload) {
  let m;
  try { m = JSON.parse(payload.toString()); } catch (e) { return; }
  if (topic.endsWith("/join")) {
    const existing = host.seatOf.get(m.id);
    if (existing !== undefined) {
      const hp = host.players.get(existing);
      if (hp) {
        if (m.name) hp.name = String(m.name).slice(0, 10);
        if (m.avatar !== undefined) hp.avatar = m.avatar || "";
      }
      if (host.started) {
        sendStateTo(m.id, existing);
        hostRender();
      } else {
        publishRoom();
        renderWaiting({ players: [...host.players.values()], chips: host.config ? host.config.chips : 1000 });
      }
      return;
    }
    if (host.started) return;
    const maxSeats = host.config ? host.config.players : 9;
    if (host.players.size >= maxSeats) return;
    let seat = 0;
    while (host.players.has(seat)) seat++;
    host.players.set(seat, { id: m.id, name: (m.name || "玩家").slice(0, 10), avatar: m.avatar || "" });
    host.seatOf.set(m.id, seat);
    const left = maxSeats - host.players.size;
    setNetStatus(left > 0
      ? `${(m.name || "玩家").slice(0, 10)} 加入了，还差 ${left} 人（空位可补电脑，直接点开始也行）`
      : `${(m.name || "玩家").slice(0, 10)} 加入了，人齐了，点“开始”`);
    publishRoom();
    renderWaiting({ players: [...host.players.values()], chips: host.config ? host.config.chips : 1000 });
    if (new URLSearchParams(location.search).get("auto") === "1" && host.players.size >= 2 && !host.started) {
      setTimeout(startHostGame, 600);
    }
  } else if (topic.endsWith("/action")) {
    if (!host.started || !host.game) return;
    const seat = host.seatOf.get(m.id);
    if (seat === undefined) return;
    if (host.game.act(seat, m.a, m.amt || 0)) hostRender();
  } else if (topic.endsWith("/leave")) {
    if (!host.started) {
      const seat = host.seatOf.get(m.id);
      if (seat !== undefined) {
        host.seatOf.delete(m.id); host.players.delete(seat);
        publishRoom();
        renderWaiting({ players: [...host.players.values()], chips: host.config ? host.config.chips : 1000 });
      }
    } else {
      closeRoom("有玩家退出，房间已关闭");
    }
  }
}

function serializeFor(seat) {
  const g = host.game;
  const showAll = g.phase === "over" || g.phase === "gameover";
  return {
    players: g.players.map((p, i) => ({
      name: p.name, stack: p.stack, bet: p.bet, folded: p.folded, allin: p.allin, last: p.last,
      avatar: (host.players.get(i) && host.players.get(i).avatar) || "",
      hole: (i === seat || (showAll && !p.folded)) ? p.hole : null,
    })),
    board: g.board, pot: g.potTotal(), phase: g.phase, actor: g.actor, button: g.button,
    results: g.results, log: g.log.slice(-40),
    legal: (g.actor === seat && ["preflop", "flop", "turn", "river"].includes(g.phase)) ? g.legal(seat) : null,
  };
}

function sendStateTo(clientId, seat) {
  if (!mq || !host || !host.game) return;
  mq.publish(TOPIC(roomCode, "state/" + clientId), JSON.stringify(serializeFor(seat)), { qos: 0 });
}

function hostRender() {
  if (!host || !host.game) { publishRoom(); return; }
  view = adaptState(serializeFor(0));
  render();
  for (const [seat, p] of host.players.entries()) {
    if (seat === 0) continue;
    sendStateTo(p.id, seat);
  }
  if (view.phase === "over" || view.phase === "gameover") showOverlay();
  else hideOverlay();
  hostScheduleAI();
}

function hostScheduleAI() {
  if (!host) return;
  clearTimeout(host.aiTimer);
  const g = host.game;
  if (!g || !["preflop", "flop", "turn", "river"].includes(g.phase)) return;
  const p = g.players[g.actor];
  if (!p || !p.ai) return;
  host.aiTimer = setTimeout(() => {
    if (!host || !host.game) return;
    const gg = host.game;
    const pp = gg.players[gg.actor];
    if (!pp || !pp.ai) return;
    const [a, amt] = aiDecide(gg, gg.actor);
    if (gg.act(gg.actor, a, amt)) hostRender();
  }, 650);
}

function startHostGame() {
  if (!host) return;
  if (host.started && host.game && !["over", "gameover"].includes(host.game.phase)) return;
  const cfg = host.config || { players: 4, chips: 1000, bb: 10, fillAI: true };
  const entries = [...host.players.entries()].sort((a, b) => a[0] - b[0]);
  const humans = entries.length;
  let total = cfg.fillAI ? Math.max(cfg.players, humans) : humans;
  if (total < 2) {
    alert(cfg.fillAI ? "至少需要 2 人（含电脑）" : "至少需要 2 名真人，或勾选“空位用电脑补齐”");
    return;
  }
  total = Math.min(total, 9);
  if (!beginTable(cfg.chips)) return;
  tableStarted = true;
  const compact = new Map(entries.map(([, p], idx) => [idx, p]));
  host.players = compact;
  host.seatOf = new Map(entries.map(([, p], idx) => [p.id, idx]));
  const players = [];
  for (let s = 0; s < total; s++) {
    const h = compact.get(s);
    players.push(h
      ? { name: h.name, stack: cfg.chips, ai: false }
      : { name: `电脑${"ABCDEFGHI"[s] || s}`, stack: cfg.chips, ai: true });
  }
  host.game = new Game(players, Math.floor(cfg.bb / 2), cfg.bb);
  host.game.startHand();
  host.started = true;
  $("startBtn").classList.add("hidden");
  publishRoom();
  hostRender();
}

function hostNextHand() {
  if (!host || !host.game) return;
  if (!["over", "gameover"].includes(host.game.phase)) return;
  hideOverlay();
  host.game.startHand();
  hostRender();
}

function closeRoom(msg) {
  if (mq) { try { mq.publish(TOPIC(roomCode, "room"), JSON.stringify({ t: "closed" }), { qos: 0 }); } catch (e) {} }
  alert(msg);
  leaveTable();
}

function joinRoom(code) {
  mode = "online"; isHost = false; isHostMode = false;
  roomCode = String(code || "").toUpperCase();
  $("menu").classList.add("hidden");
  $("tableScreen").classList.remove("hidden");
  if (!canvas) showTable();
  $("roomInfo").textContent = `房间 ${roomCode} · 连接中…`;
  $("copyBtn").classList.add("hidden");
  $("startBtn").classList.add("hidden");
  $("inviteBtn").classList.add("hidden");
  renderWaiting({ players: [{ name: nick() }] });
  mqttConnect(() => {
    $("roomInfo").textContent = `房间 ${roomCode} · 玩家`;
    setNetStatus(`已连接，正在加入房间 ${roomCode}…`);
    mq.subscribe([TOPIC(roomCode, "room"), TOPIC(roomCode, "state/" + myId)], { qos: 1 });
    if (!mq.__guestBound) {
      mq.on("message", onGuestMessage);
      mq.__guestBound = true;
    }
    startJoinLoop();
  });
}

function startJoinLoop() {
  if (joinTimer) clearInterval(joinTimer);
  const sendJoin = () => {
    if (!mq) return;
    mq.publish(TOPIC(roomCode, "join"), JSON.stringify({ id: myId, name: nick(), avatar: (profile && profile.avatar) || "" }), { qos: 1 });
  };
  sendJoin();
  joinTimer = setInterval(sendJoin, 2500);
  setTimeout(() => {
    if (joinTimer) setNetStatus(`还没收到房主回应，确认房主还在房间 ${roomCode}`);
  }, 12000);
}

function onGuestMessage(topic, payload) {
  lastHostMsg = Date.now();
  let m;
  try { m = JSON.parse(payload.toString()); } catch (e) { return; }
  if (topic.endsWith("/room")) {
    if (m.t === "closed") { alert("房间已关闭"); leaveTable(); return; }
    if (joinTimer) { clearInterval(joinTimer); joinTimer = null; }
    if (m.started && !tableActive) {
      alert("这局已经开始了，等房主开下一局再加入吧");
      leaveTable();
      return;
    }
    if (!tableActive && !m.started) {
      if (!beginTable(m.chips || 1000)) { leaveTable(); return; }
    }
    const mine = (m.players || []).find((p) => p.id === myId);
    if (mine) mySeat = mine.seat;
    if (m.started) { hideOverlay(); showTable(); }
    else {
      setNetStatus(`已进入房间 ${roomCode}，带入 ${fmtMoney(m.chips || 1000)}，等待房主点“开始”`);
      renderWaiting({ players: m.players || [], chips: m.chips || 1000 });
    }
  } else if (topic.includes("/state/")) {
    if (joinTimer) { clearInterval(joinTimer); joinTimer = null; }
    view = adaptState(m);
    hero = mySeat;
    if (!view) return;
    if (tableActive && !tableStarted && ["preflop", "flop", "turn", "river", "over", "gameover"].includes(view.phase)) {
      tableStarted = true;
    }
    if ($("tableScreen").classList.contains("hidden")) showTable();
    render();
    if (view.phase === "over" || view.phase === "gameover") showOverlay();
    else hideOverlay();
  }
}

function adaptState(s) {
  if (!s) return null;
  return {
    players: s.players.map((p) => ({
      name: p.name, stack: p.stack, bet: p.bet, folded: p.folded, allin: p.allin,
      last: p.last, avatar: p.avatar || "", hole: p.hole ? p.hole.map(cardText) : null,
    })),
    board: s.board.map(cardText),
    pot: s.pot,
    phase: s.phase,
    actor: s.actor,
    button: s.button,
    results: s.results || [],
    log: s.log || [],
    legal: s.legal || null,
  };
}

function renderWaiting(msg) {
  const stack = Number(msg.chips) || 1000;
  view = {
    players: msg.players.map((p) => ({ name: p.name, avatar: p.avatar || "", stack, bet: 0, folded: false, allin: false, last: "", hole: null })),
    board: [], pot: 0, phase: "waiting", actor: -1, button: 0, results: [], log: ["等待其他玩家加入…"], legal: null,
  };
  render();
}

function leaveTable() {
  if (tableActive) endTable(heroStackWithBet());
  if (joinTimer) { clearInterval(joinTimer); joinTimer = null; }
  if (host && host.roomTimer) { clearInterval(host.roomTimer); host.roomTimer = null; }
  if (mode === "online" && mq) {
    try {
      if (isHostMode) mq.publish(TOPIC(roomCode, "room"), JSON.stringify({ t: "closed" }), { qos: 0 });
      else mq.publish(TOPIC(roomCode, "leave"), JSON.stringify({ id: myId }), { qos: 0 });
    } catch (e) {}
    const old = mq;
    mq = null;
    setTimeout(() => { try { old.end(true); } catch (e) {} }, 150);
  }
  mq = null; host = null; isHostMode = false;
  game = null; view = null; roomCode = ""; isHost = false;
  $("startBtn").classList.add("hidden");
  $("copyBtn").classList.add("hidden");
  $("inviteBtn").classList.add("hidden");
  $("tableScreen").classList.add("hidden");
  $("tabbar").classList.remove("hidden");
  switchTab("home");
  hideOverlay();
}

/* ---------------- 事件 ---------------- */
window.addEventListener("resize", resize);

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState !== "visible") return;
  if (mode !== "online" || !mq || !roomCode) return;
  if (!mq.connected) { try { mq.reconnect(); } catch (e) {} }
  setTimeout(() => {
    if (!mq || !mq.connected) return;
    if (isHostMode && host) {
      mq.subscribe([TOPIC(roomCode, "join"), TOPIC(roomCode, "action"), TOPIC(roomCode, "leave")], { qos: 1 });
      publishRoom();
      if (host.started && host.game) hostRender();
      setNetStatus("已回到前台，房间已恢复");
    } else {
      mq.subscribe([TOPIC(roomCode, "room"), TOPIC(roomCode, "state/" + myId)], { qos: 1 });
      startJoinLoop();
      setNetStatus("已回到前台，正在重新加入房间…");
    }
  }, 600);
});

setInterval(() => {
  if (mode !== "online" || isHostMode || !roomCode) return;
  if (lastHostMsg && Date.now() - lastHostMsg > 12000) {
    setNetStatus("房主长时间没响应（可能切后台了），等他回到游戏…");
  }
}, 4000);

window.addEventListener("load", () => {
  initMenu();

  $("loginBtn").onclick = login;
  $("copyUid").onclick = () => {
    if (!profile) return;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(profile.uid).then(() => setSocialStatus("ID 已复制：" + profile.uid)).catch(() => prompt("我的 ID", profile.uid));
    } else {
      prompt("我的 ID", profile.uid);
    }
  };
  $("logoutBtn").onclick = logout;
  $("avatarBtn").onclick = () => $("avatarFile").click();
  $("avatarFile").onchange = (e) => setAvatarFile(e.target.files && e.target.files[0]);
  $("addFriend").onclick = addFriend;
  $("checkinBtn").onclick = checkIn;
  $("homeBalance").onclick = () => switchTab("me");
  document.querySelectorAll("#tabbar .tab").forEach((b) => {
    b.onclick = () => switchTab(b.getAttribute("data-tab"));
  });
  $("inviteBtn").onclick = () => { renderPickList(); $("friendPick").classList.remove("hidden"); };
  $("pickClose").onclick = () => $("friendPick").classList.add("hidden");

  $("tileSolo").onclick = openSoloSetup;
  $("tileHost").onclick = openHostSetup;
  $("tileJoin").onclick = openJoinSetup;
  $("soloStart").onclick = startSoloFromSetup;
  $("soloCancel").onclick = () => $("soloSetup").classList.add("hidden");
  $("hostStart").onclick = createHostFromSetup;
  $("hostCancel").onclick = () => $("hostSetup").classList.add("hidden");
  $("hostFillAI").onchange = (e) => { hostCfg.fillAI = !!e.target.checked; };
  $("joinStart").onclick = joinFromSetup;
  $("joinCancel").onclick = () => $("joinSetup").classList.add("hidden");
  $("copyBtn").onclick = () => {
    if (!roomCode) return;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(roomCode).then(() => setNetStatus("房间码已复制：" + roomCode)).catch(() => prompt("房间码", roomCode));
    } else {
      prompt("房间码", roomCode);
    }
  };
  $("leaveBtn").onclick = leaveTable;
  $("startBtn").onclick = () => { if (isHostMode) startHostGame(); };
  $("foldBtn").onclick = () => doAction("fold");
  $("callBtn").onclick = () => doAction(view && view.legal && view.legal.check ? "check" : "call");
  $("raiseBtn").onclick = () => doAction("raise");
  $("allinBtn").onclick = () => doAction("allin");
  $("nextBtn").onclick = () => {
    if (mode === "online" && view && view.phase === "gameover") { leaveTable(); return; }
    if (mode === "online" && !isHostMode) return;
    nextHand();
  };
  $("raise").oninput = () => { $("raiseVal").textContent = $("raise").value; };

  const params = new URLSearchParams(location.search);
  loadProfile();
  if (!profile && params.get("demo")) {
    profile = { uid: genUid(), name: "测试" };
    applyProfile();
  }
  if (params.get("demo") === "solo") {
    soloCfg.players = parseInt(params.get("n") || "4", 10);
    setTimeout(startSolo, 100);
  }
  if (params.get("demo") === "host") {
    setTimeout(() => createRoom(params.get("code") || null, hostCfg), 300);
  }
  if (params.get("demo") === "join") {
    setTimeout(() => joinRoom((params.get("code") || "").toUpperCase()), 300);
  }
});
