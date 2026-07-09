from fastapi import APIRouter
from fastapi.responses import HTMLResponse


router = APIRouter(tags=["admin-console"])


@router.get("/admin", response_class=HTMLResponse)
def admin_console() -> HTMLResponse:
    return HTMLResponse(HTML, headers={"Cache-Control": "no-store"})


HTML = r"""<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>咨询师助手后台</title>
  <style>
    :root { color-scheme: light; --bg:#faf6f0; --panel:#fffdf9; --soft:#f3e9df; --line:#e5d5c7; --text:#302a26; --muted:#756b63; --brand:#a85b49; --ok:#557963; --bad:#b84d47; }
    * { box-sizing: border-box; }
    body { margin: 0; background: var(--bg); color: var(--text); font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    main { max-width: 1180px; margin: 0 auto; padding: 28px 18px 48px; }
    header { display: flex; justify-content: space-between; gap: 18px; align-items: flex-end; margin-bottom: 18px; }
    h1, h2, h3 { margin: 0; letter-spacing: 0; }
    h1 { font-size: 34px; line-height: 1.15; }
    h2 { font-size: 22px; margin-bottom: 14px; }
    h3 { font-size: 17px; margin-bottom: 10px; }
    section, .card { background: var(--panel); border: 1px solid var(--line); border-radius: 8px; padding: 18px; }
    section { margin-bottom: 16px; }
    label { display: grid; gap: 6px; color: var(--muted); font-weight: 800; font-size: 13px; }
    input, select, textarea { width: 100%; border: 1px solid var(--line); border-radius: 6px; background: #fff; color: var(--text); padding: 10px 12px; font: inherit; }
    textarea { min-height: 116px; resize: vertical; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 13px; }
    button { border: 0; border-radius: 6px; padding: 10px 14px; background: var(--brand); color: #fff; font: inherit; font-weight: 900; cursor: pointer; }
    button.secondary { background: var(--soft); color: var(--brand); }
    button.ghost { background: transparent; color: var(--brand); padding-inline: 6px; }
    button:disabled { opacity: .55; cursor: not-allowed; }
    table { width: 100%; border-collapse: collapse; }
    th, td { border-bottom: 1px solid var(--line); padding: 10px 8px; text-align: left; vertical-align: top; }
    th { color: var(--muted); font-size: 13px; white-space: nowrap; }
    code { word-break: break-word; }
    .eyebrow, .muted { color: var(--muted); }
    .eyebrow { font-weight: 900; }
    .grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
    .grid-3 { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; }
    .layout { display: grid; grid-template-columns: minmax(0, 1.1fr) minmax(320px, .9fr); gap: 16px; align-items: start; }
    .row { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
    .tabs { margin-bottom: 16px; }
    .tab { display: none; }
    .tab.active { display: block; }
    .segmented { display: inline-flex; padding: 4px; border-radius: 8px; background: var(--soft); margin-bottom: 14px; }
    .segmented button { background: transparent; color: var(--muted); }
    .segmented button.active { background: var(--panel); color: var(--brand); box-shadow: inset 0 0 0 1px var(--line); }
    .ai-panel { display: none; }
    .ai-panel.active { display: block; }
    .status { min-height: 24px; color: var(--brand); font-weight: 900; text-align: right; }
    .stats { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 10px; margin-bottom: 16px; }
    .stat strong { display: block; font-size: 26px; margin-bottom: 4px; }
    .pill { display: inline-flex; padding: 3px 8px; border-radius: 999px; background: #e6f1ea; color: var(--ok); font-weight: 900; font-size: 12px; }
    .pill.bad { background: #f6e0db; color: var(--bad); }
    .hidden { display: none; }
    .table-wrap { overflow: auto; margin-top: 12px; }
    .help { margin-top: 8px; color: var(--muted); font-size: 13px; }
    .pager { justify-content: space-between; margin-top: 12px; }
    @media (max-width: 860px) {
      header, .grid, .grid-3, .layout, .stats { display: block; }
      label, .stat { margin-bottom: 10px; }
      table { font-size: 13px; }
      .status { text-align: left; }
    }
  </style>
</head>
<body>
<main>
  <header>
    <div>
      <div class="eyebrow">咨询师助手</div>
      <h1>后台管理</h1>
    </div>
    <div class="status" id="status" role="status"></div>
  </header>

  <section>
    <h2>登录</h2>
    <div class="grid">
      <label>邮箱<input id="email" value="admin@163.com" autocomplete="username"></label>
      <label>密码<input id="password" type="password" value="123456" autocomplete="current-password"></label>
    </div>
    <input id="token" type="hidden">
    <div class="help">后台仅管理员账号可进入；普通用户登录后会被拒绝。</div>
    <div class="row">
      <button onclick="login()">登录后台</button>
      <button class="secondary" onclick="loadAll()">刷新</button>
      <button class="ghost" onclick="logout()">清空登录</button>
    </div>
  </section>

  <div class="tabs row">
    <button class="secondary" onclick="showTab('users')">用户管理</button>
    <button class="secondary" onclick="showTab('ai')">大模型配置</button>
  </div>

  <section id="users" class="tab active">
    <h2>用户管理</h2>
    <div class="stats">
      <div class="card stat"><strong id="statTotal">-</strong><span class="muted">用户总数</span></div>
      <div class="card stat"><strong id="statPaid">-</strong><span class="muted">本页付费/企业</span></div>
      <div class="card stat"><strong id="statActive">-</strong><span class="muted">本页可用账号</span></div>
      <div class="card stat"><strong id="statSuspended">-</strong><span class="muted">本页停用账号</span></div>
    </div>
    <div class="layout">
      <div>
        <div class="row">
          <input id="keyword" placeholder="搜索邮箱或昵称" style="max-width:260px">
          <select id="userStatus" style="max-width:150px"><option value="">全部状态</option><option value="active">active</option><option value="suspended">suspended</option></select>
          <select id="planFilter" style="max-width:150px"><option value="">全部套餐</option><option>free</option><option>trial</option><option>pro</option><option>team</option><option>enterprise</option></select>
          <select id="pageSize" style="max-width:120px" onchange="setPageSize()"><option>10</option><option selected>20</option><option>50</option><option>100</option></select>
          <button onclick="searchUsers()">查询</button>
        </div>
        <div class="table-wrap">
          <table>
            <thead><tr><th>用户</th><th>状态</th><th>套餐</th><th>计费</th><th>操作</th></tr></thead>
            <tbody id="usersBody"><tr><td colspan="5" class="muted">未加载</td></tr></tbody>
          </table>
        </div>
        <div class="row pager">
          <span class="muted" id="pageInfo">第 1 页</span>
          <span class="row">
            <button class="secondary" onclick="prevPage()">上一页</button>
            <button class="secondary" onclick="nextPage()">下一页</button>
          </span>
        </div>
      </div>
      <div class="card" id="userEditor">
        <h3>用户详情</h3>
        <p class="muted" id="userEditorEmpty">从左侧选择一个用户。</p>
        <div id="userEditorForm" class="hidden">
          <p><strong id="editName"></strong><br><span class="muted" id="editEmail"></span></p>
          <div class="grid">
            <label>角色<select id="editRole"><option>user</option><option>admin</option></select></label>
            <label>状态<select id="editStatus"><option>active</option><option>suspended</option></select></label>
            <label>套餐<select id="editPlan"><option>free</option><option>trial</option><option>pro</option><option>team</option><option>enterprise</option></select></label>
            <label>计费状态<input id="editBillingStatus" placeholder="active / trialing / canceled"></label>
            <label>客户 ID<input id="editCustomerId" placeholder="cus_xxx"></label>
            <label>订阅 ID<input id="editSubscriptionId" placeholder="sub_xxx"></label>
          </div>
          <label>权益 JSON<textarea id="editEntitlements"></textarea></label>
          <label>用量 JSON<textarea id="editUsage"></textarea></label>
          <div class="row">
            <button onclick="saveSelectedUser()">保存用户</button>
            <button class="secondary" onclick="resetSelectedUser()">还原</button>
          </div>
          <div class="help">权益和用量先保留 JSON，等计费规则确定后再做专用表单。</div>
        </div>
      </div>
    </div>
  </section>

  <section id="ai" class="tab">
    <h2>大模型配置</h2>
    <div class="segmented">
      <button id="asrConfigTab" class="active" onclick="showAiPanel('asr')">音频转文字</button>
      <button id="llmConfigTab" onclick="showAiPanel('llm')">大语言模型</button>
    </div>
    <div id="asrConfigPanel" class="ai-panel active">
      <div class="grid">
      <label>供应商<select id="asrProvider"><option>deterministic</option><option>bailian</option></select></label>
      <label>Base URL<input id="asrBaseUrl"></label>
      <label>API Key<input id="asrApiKey" placeholder="留空表示不修改"><span class="help" id="asrApiKeyHint"></span></label>
      <label>音频输入<select id="audioInput"><option>base64</option><option>minio_url</option></select></label>
      <label>文件 ASR 模型<input id="asrModel"></label>
      <label>短音频 ASR 模型<input id="localAsrModel"></label>
      </div>
    </div>
    <div id="llmConfigPanel" class="ai-panel">
      <div class="grid">
      <label>供应商<select id="llmProvider"><option>deterministic</option><option>bailian</option><option>openai_compatible</option></select></label>
      <label>Base URL<input id="llmBaseUrl" placeholder="例如 https://api.openai.com/v1"></label>
      <label>API Key<input id="llmApiKey" placeholder="留空表示不修改"><span class="help" id="llmApiKeyHint"></span></label>
      <label>摘要模型<input id="summaryModel"></label>
      <label>报告模型<input id="reportModel"></label>
      <label>督导模型<input id="supervisionModel"></label>
      </div>
    </div>
    <div class="grid" style="margin-top:12px">
      <label>超时秒数<input id="timeoutSeconds" type="number" min="1"></label>
      <label>轮询间隔<input id="pollIntervalSeconds" type="number" min="0.1" step="0.1"></label>
      <label>最大轮询次数<input id="maxPollAttempts" type="number" min="1"></label>
    </div>
    <div class="row">
      <button onclick="loadAiConfig()">读取配置</button>
      <button onclick="saveAiConfig()">保存配置</button>
    </div>
  </section>
</main>

<script>
const $ = (id) => document.getElementById(id);
const say = (text) => $("status").textContent = text || "";
const token = () => $("token").value.trim();
let usersById = {};
let selectedUserId = null;
let userPage = 1;
let userTotal = 0;

$("token").value = sessionStorage.getItem("adminToken") || "";
if (token()) loadAll();

function showTab(id) {
  document.querySelectorAll(".tab").forEach((el) => el.classList.toggle("active", el.id === id));
}

function showAiPanel(id) {
  $("asrConfigPanel").classList.toggle("active", id === "asr");
  $("llmConfigPanel").classList.toggle("active", id === "llm");
  $("asrConfigTab").classList.toggle("active", id === "asr");
  $("llmConfigTab").classList.toggle("active", id === "llm");
}

async function api(path, options = {}) {
  const headers = {"Content-Type": "application/json", ...(options.headers || {})};
  if (token()) headers.Authorization = `Bearer ${token()}`;
  const res = await fetch(path, {...options, headers});
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error?.message || `请求失败 ${res.status}`);
    err.code = data.error?.code;
    throw err;
  }
  return data;
}

async function login() {
  try {
    say("登录中...");
    const data = await api("/api/v1/auth/login", {method: "POST", body: JSON.stringify({email: $("email").value, password: $("password").value})});
    $("token").value = data.access_token;
    sessionStorage.setItem("adminToken", data.access_token);
    await loadAll();
  } catch (err) {
    if (err.code === "admin_required") {
      logout();
      say("该账号不是管理员，不能登录后台。");
      return;
    }
    say(err.message);
  }
}

function logout() {
  $("token").value = "";
  sessionStorage.removeItem("adminToken");
  say("已清空登录");
}

async function loadAll() {
  try {
    await Promise.all([loadUsers(), loadAiConfig()]);
    say("已刷新");
  } catch (err) { say(err.message); }
}

async function loadUsers() {
  const q = new URLSearchParams();
  if ($("keyword").value.trim()) q.set("keyword", $("keyword").value.trim());
  if ($("userStatus").value) q.set("status", $("userStatus").value);
  if ($("planFilter").value) q.set("plan_code", $("planFilter").value);
  q.set("page", String(userPage));
  q.set("page_size", $("pageSize").value);
  const data = await api(`/api/v1/admin/users?${q}`);
  userTotal = data.total;
  usersById = Object.fromEntries(data.items.map((user) => [user.id, user]));
  $("usersBody").innerHTML = data.items.map(renderUser).join("") || `<tr><td colspan="5" class="muted">暂无用户</td></tr>`;
  renderStats(data);
  renderPager(data);
  if (selectedUserId && usersById[selectedUserId]) selectUser(selectedUserId);
}

function searchUsers() {
  userPage = 1;
  loadUsers();
}

function setPageSize() {
  userPage = 1;
  loadUsers();
}

function prevPage() {
  if (userPage <= 1) return;
  userPage -= 1;
  loadUsers();
}

function nextPage() {
  const maxPage = Math.max(1, Math.ceil(userTotal / Number($("pageSize").value)));
  if (userPage >= maxPage) return;
  userPage += 1;
  loadUsers();
}

function renderPager(data) {
  const maxPage = Math.max(1, Math.ceil(data.total / data.page_size));
  $("pageInfo").textContent = `第 ${data.page} / ${maxPage} 页，共 ${data.total} 个用户`;
}

function renderStats(data) {
  const users = data.items;
  $("statTotal").textContent = data.total;
  $("statPaid").textContent = users.filter((u) => !["free", "trial"].includes(u.plan_code)).length;
  $("statActive").textContent = users.filter((u) => u.status === "active").length;
  $("statSuspended").textContent = users.filter((u) => u.status === "suspended").length;
}

function renderUser(user) {
  const statusClass = user.status === "active" ? "" : "bad";
  const billing = user.billing?.status || "-";
  return `<tr>
    <td><strong>${escapeHtml(user.display_name)}</strong><br><span class="muted">${escapeHtml(user.email)}</span><br><span class="pill">${escapeHtml(user.role)}</span></td>
    <td><span class="pill ${statusClass}">${escapeHtml(user.status)}</span></td>
    <td>${escapeHtml(user.plan_code)}</td>
    <td>${escapeHtml(billing)}</td>
    <td><button class="secondary" onclick="selectUser('${user.id}')">编辑</button></td>
  </tr>`;
}

function selectUser(userId) {
  selectedUserId = userId;
  resetSelectedUser();
}

function resetSelectedUser() {
  const user = usersById[selectedUserId];
  if (!user) return;
  $("userEditorEmpty").classList.add("hidden");
  $("userEditorForm").classList.remove("hidden");
  $("editName").textContent = user.display_name;
  $("editEmail").textContent = user.email;
  $("editRole").value = user.role;
  $("editStatus").value = user.status;
  $("editPlan").value = user.plan_code;
  $("editBillingStatus").value = user.billing?.status || "";
  $("editCustomerId").value = user.billing?.customer_id || "";
  $("editSubscriptionId").value = user.billing?.subscription_id || "";
  $("editEntitlements").value = JSON.stringify(user.entitlements || {}, null, 2);
  $("editUsage").value = JSON.stringify(user.usage || {}, null, 2);
}

async function saveSelectedUser() {
  if (!selectedUserId) return say("请先选择用户");
  let entitlements, usage;
  try {
    entitlements = JSON.parse($("editEntitlements").value || "{}");
    usage = JSON.parse($("editUsage").value || "{}");
  } catch {
    return say("权益或用量 JSON 格式不正确");
  }
  try {
    await api(`/api/v1/admin/users/${selectedUserId}`, {method: "PATCH", body: JSON.stringify({
      role: $("editRole").value,
      status: $("editStatus").value,
      plan_code: $("editPlan").value,
      entitlements,
      usage,
      billing_status: $("editBillingStatus").value || null,
      billing_customer_id: $("editCustomerId").value || null,
      billing_subscription_id: $("editSubscriptionId").value || null
    })});
    await loadUsers();
    say("用户已保存");
  } catch (err) { say(err.message); }
}

async function loadAiConfig() {
  const c = await api("/api/v1/admin/config/ai-model");
  const asr = c.asr || {};
  const llm = c.llm || {};
  $("asrProvider").value = asr.provider || c.provider;
  $("asrBaseUrl").value = asr.base_url || c.base_url;
  $("audioInput").value = asr.audio_input_mode || c.audio_input_mode;
  $("asrModel").value = asr.model || c.models.asr;
  $("localAsrModel").value = asr.local_model || c.models.local_asr;
  $("llmProvider").value = llm.provider || c.provider;
  $("llmBaseUrl").value = llm.base_url || c.base_url;
  $("summaryModel").value = llm.summary_model || c.models.summary;
  $("reportModel").value = llm.report_model || c.models.report;
  $("supervisionModel").value = llm.supervision_model || c.models.supervision;
  $("timeoutSeconds").value = c.timeout_seconds;
  $("pollIntervalSeconds").value = c.poll_interval_seconds;
  $("maxPollAttempts").value = c.max_poll_attempts;
  $("asrApiKeyHint").textContent = asr.api_key_set ? `当前 Key：${asr.api_key_preview}` : "当前未设置 Key";
  $("llmApiKeyHint").textContent = llm.api_key_set ? `当前 Key：${llm.api_key_preview}` : "当前未设置 Key";
}

async function saveAiConfig() {
  try {
    await api("/api/v1/admin/config/ai-model", {method: "PUT", body: JSON.stringify({
      asr: {
        provider: $("asrProvider").value,
        base_url: $("asrBaseUrl").value,
        api_key: $("asrApiKey").value.trim() || null,
        audio_input_mode: $("audioInput").value,
        model: $("asrModel").value,
        local_model: $("localAsrModel").value
      },
      llm: {
        provider: $("llmProvider").value,
        base_url: $("llmBaseUrl").value,
        api_key: $("llmApiKey").value.trim() || null,
        summary_model: $("summaryModel").value,
        report_model: $("reportModel").value,
        supervision_model: $("supervisionModel").value
      },
      timeout_seconds: Number($("timeoutSeconds").value),
      poll_interval_seconds: Number($("pollIntervalSeconds").value),
      max_poll_attempts: Number($("maxPollAttempts").value)
    })});
    $("asrApiKey").value = "";
    $("llmApiKey").value = "";
    await loadAiConfig();
    say("配置已保存");
  } catch (err) { say(err.message); }
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (c) => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c]));
}
</script>
</body>
</html>"""
