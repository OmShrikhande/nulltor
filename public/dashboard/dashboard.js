/* ═══════════════════════════════════════════════════
   Nulltor Dashboard — SPA Client Logic
   Vanilla JS, no dependencies, hash-based routing
═══════════════════════════════════════════════════ */

const API = 'http://localhost:8000/api';

// ── State ────────────────────────────────────────────
const state = {
  token: localStorage.getItem('nulltor_token') || null,
  user: JSON.parse(localStorage.getItem('nulltor_user') || 'null'),
  currentView: null,
  selectedProjectId: null,
};

// ── API helper ───────────────────────────────────────
async function api(method, path, body = null) {
  const opts = {
    method,
    headers: { 'Content-Type': 'application/json' },
  };
  if (state.token) opts.headers['Authorization'] = `Bearer ${state.token}`;
  if (body) opts.body = JSON.stringify(body);

  const res = await fetch(API + path, opts);

  if (res.status === 401) {
    logout();
    throw new Error('Session expired');
  }

  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try { 
      const d = await res.json(); 
      if (Array.isArray(d.detail)) {
        msg = d.detail.map(e => e.msg).join(", ");
      } else {
        msg = d.detail || msg;
      }
    } catch (_) {}
    throw new Error(msg);
  }

  if (res.status === 204) return null;
  return res.json();
}

// ── Auth ─────────────────────────────────────────────
async function login(email, password) {
  const data = await api('POST', '/auth/login', { email, password });
  state.token = data.access_token;
  state.user  = data.user;
  localStorage.setItem('nulltor_token', state.token);
  localStorage.setItem('nulltor_user', JSON.stringify(state.user));
}

function logout() {
  state.token = null;
  state.user  = null;
  localStorage.removeItem('nulltor_token');
  localStorage.removeItem('nulltor_user');
  location.hash = '';
  boot();
}

// ── DOM helpers ──────────────────────────────────────
const $ = (id) => document.getElementById(id);
const el = (tag, cls, html = '') => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html) e.innerHTML = html;
  return e;
};

function show(id) { $(id).hidden = false; }
function hide(id) { $(id).hidden = true; }

function toast(msg, type = 'info') {
  const t = el('div', `toast ${type}`, msg);
  $('toast-container').appendChild(t);
  setTimeout(() => { t.classList.add('hide'); setTimeout(() => t.remove(), 300); }, 3500);
}

function setLoading(container, on) {
  if (on) container.innerHTML = '<div class="spinner-wrap"><div class="spinner"></div></div>';
}

// ── Modal ─────────────────────────────────────────────
function openModal(title, bodyHTML, footerHTML) {
  $('modal-title').textContent = title;
  $('modal-body').innerHTML  = bodyHTML;
  $('modal-footer').innerHTML = footerHTML;
  $('modal-overlay').hidden = false;
}

function closeModal() { $('modal-overlay').hidden = true; }

$('modal-close').addEventListener('click', closeModal);
$('modal-overlay').addEventListener('click', (e) => { if (e.target === $('modal-overlay')) closeModal(); });

// ── User pill ────────────────────────────────────────
function renderUserPill() {
  if (!state.user) return;
  const u = state.user;
  $('user-avatar').textContent = u.username.slice(0, 2).toUpperCase();
  $('user-name').textContent = u.username;
  const rb = $('user-role-badge');
  rb.textContent = u.role;
  rb.className = `user-role-badge ${u.role}`;
}

// ── Sidebar nav ──────────────────────────────────────
function setActiveNav(view) {
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  const navEl = document.querySelector(`[data-view="${view}"]`);
  if (navEl) navEl.classList.add('active');
}

function initNav() {
  // Hide superadmin-only items for non-superadmins
  const isSA = state.user?.role === 'superadmin';
  document.querySelectorAll('.superadmin-only').forEach(el => {
    el.style.display = isSA ? '' : 'none';
  });

  document.querySelectorAll('.nav-item[data-view]').forEach(navEl => {
    navEl.addEventListener('click', (e) => {
      e.preventDefault();
      const view = navEl.dataset.view;
      location.hash = view;
    });
  });

  $('logout-btn').addEventListener('click', logout);
}

// ── Router ───────────────────────────────────────────
const views = {
  projects: renderProjectsView,
  members:  renderMembersView,
  logs:     renderLogsView,
  users:    renderUsersView,
};

function navigate() {
  const hash = location.hash.replace('#', '') || 'projects';
  const view = Object.keys(views).includes(hash) ? hash : 'projects';

  // Gate superadmin-only views
  if (view === 'users' && state.user?.role !== 'superadmin') {
    location.hash = 'projects';
    return;
  }

  state.currentView = view;
  setActiveNav(view);

  const titles = { projects: 'Projects', members: 'Members', logs: 'Audit Logs', users: 'User Management' };
  $('view-title').textContent = titles[view] || 'Dashboard';
  $('breadcrumb').textContent = '';

  const container = $('view-container');
  setLoading(container, true);

  views[view](container);
}

// ── ─────────────────────────────────────────────────
// VIEW: PROJECTS
// ─────────────────────────────────────────────────────
async function renderProjectsView(container) {
  const isSA  = state.user?.role === 'superadmin';
  const isAdm = state.user?.role === 'admin' || isSA;

  const actionBtn = $('topbar-action-btn');
  if (isAdm) {
    actionBtn.hidden = false;
    actionBtn.textContent = '+ New Project';
    actionBtn.onclick = () => openCreateProjectModal();
  } else {
    actionBtn.hidden = true;
  }

  try {
    const data = await api('GET', '/projects?limit=100');
    const projects = data.items || [];

    if (projects.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">📁</div>
          <h3>No projects yet</h3>
          <p>${isAdm ? 'Create your first project to get started.' : 'No projects have been assigned to you yet.'}</p>
        </div>`;
      return;
    }

    const grid = el('div', 'card-grid');
    projects.forEach(p => grid.appendChild(projectCard(p, isSA)));
    container.innerHTML = '';
    container.appendChild(grid);
  } catch (e) {
    container.innerHTML = `<p class="text-danger">${e.message}</p>`;
  }
}

function projectCard(p, isSA) {
  const card = el('div', 'card');
  card.innerHTML = `
    <div class="card-title">
      <span>📁</span> ${escHtml(p.name)}
    </div>
    <p class="card-desc">${escHtml(p.description || 'No description')}</p>
    <div class="card-meta">
      <span>${new Date(p.created_at).toLocaleDateString()}</span>
      <span class="chip ${p.is_active ? 'active' : 'inactive'}">${p.is_active ? '● Active' : '● Archived'}</span>
    </div>
    <div class="card-actions">
      <button class="btn btn-ghost btn-sm view-members-btn">Members</button>
      <button class="btn btn-ghost btn-sm view-tree-btn">Files</button>
      ${isSA ? `<button class="btn btn-danger btn-sm delete-proj-btn" style="margin-left:auto">Delete</button>` : ''}
    </div>`;

  card.querySelector('.view-members-btn').addEventListener('click', (e) => {
    e.stopPropagation();
    state.selectedProjectId = p.id;
    location.hash = 'members';
  });

  card.querySelector('.view-tree-btn').addEventListener('click', (e) => {
    e.stopPropagation();
    state.selectedProjectId = p.id;
    openFileTreeModal(p);
  });

  if (isSA) {
    card.querySelector('.delete-proj-btn').addEventListener('click', async (e) => {
      e.stopPropagation();
      if (!confirm(`Delete project "${p.name}"? This is irreversible.`)) return;
      try {
        await api('DELETE', `/projects/${p.id}`);
        toast(`Project "${p.name}" deleted`, 'success');
        renderProjectsView($('view-container'));
      } catch (err) {
        toast(err.message, 'error');
      }
    });
  }

  return card;
}

function openCreateProjectModal() {
  openModal('New Project',
    `<div class="form-body">
      <div class="form-field">
        <label>Project Name</label>
        <input id="m-proj-name" type="text" placeholder="My Awesome Project" />
      </div>
      <div class="form-field">
        <label>Description</label>
        <textarea id="m-proj-desc" placeholder="What is this project about?"></textarea>
      </div>
    </div>`,
    `<button class="btn btn-ghost" id="m-cancel">Cancel</button>
     <button class="btn btn-primary" id="m-create-proj">Create Project</button>`
  );

  $('m-cancel').addEventListener('click', closeModal);
  $('m-create-proj').addEventListener('click', async () => {
    const name = $('m-proj-name').value.trim();
    const desc = $('m-proj-desc').value.trim();
    if (!name) { toast('Project name is required', 'error'); return; }
    try {
      await api('POST', '/projects', { name, description: desc });
      toast('Project created!', 'success');
      closeModal();
      renderProjectsView($('view-container'));
    } catch (err) {
      toast(err.message, 'error');
    }
  });
}

async function openFileTreeModal(project) {
  openModal(`📁 ${project.name} — Files`, '<div class="spinner-wrap"><div class="spinner"></div></div>', '');
  try {
    const tree = await api('GET', `/projects/${project.id}/tree`);
    const canDelete = state.user?.role === 'superadmin';
    const canCreate = ['superadmin','admin'].includes(state.user?.role);

    const body = document.createElement('div');

    const addBtn = canCreate ? `<button class="btn btn-primary btn-sm" id="tree-add-file">+ New File</button>` : '';
    body.innerHTML = `
      <div class="filetree">
        <div class="filetree-header">Explorer ${addBtn}</div>
        <div class="filetree-body" id="filetree-content"></div>
      </div>`;

    const treeBody = body.querySelector('#filetree-content');
    treeBody.innerHTML = renderTreeHTML(tree, 0, canDelete, project.id);

    $('modal-body').innerHTML = '';
    $('modal-body').appendChild(body);
    $('modal-footer').innerHTML = '<button class="btn btn-ghost" id="m-close-tree">Close</button>';
    $('m-close-tree').addEventListener('click', closeModal);

    if (canCreate) {
      body.querySelector('#tree-add-file')?.addEventListener('click', () => openCreateNodeModal(project.id, null));
    }

    // Wire up delete buttons
    treeBody.querySelectorAll('.delete-node-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const nodeId = btn.dataset.id;
        const nodeName = btn.dataset.name;
        if (!confirm(`Delete "${nodeName}"? Children will also be deleted.`)) return;
        try {
          await api('DELETE', `/projects/${project.id}/tree/${nodeId}`);
          toast('Deleted', 'success');
          openFileTreeModal(project);
        } catch (err) {
          toast(err.message, 'error');
        }
      });
    });

  } catch (err) {
    $('modal-body').innerHTML = `<p class="text-danger">${err.message}</p>`;
  }
}

function renderTreeHTML(nodes, depth, canDelete, projectId) {
  if (!nodes || nodes.length === 0) return '<p class="text-muted" style="padding:12px;font-size:12px">Empty directory</p>';
  return nodes.map(n => {
    const indent = depth * 16;
    const icon = n.type === 'dir' ? '📂' : '📄';
    const children = n.children?.length ? `<div>${renderTreeHTML(n.children, depth + 1, canDelete, projectId)}</div>` : '';
    const del = canDelete ? `<button class="btn btn-icon delete-node-btn" data-id="${n.id}" data-name="${escHtml(n.name)}" title="Delete">🗑</button>` : '';
    return `
      <div class="tree-node" style="padding-left:${8 + indent}px">
        <span class="tree-icon">${icon}</span>
        <span style="flex:1">${escHtml(n.name)}</span>
        ${del}
      </div>
      ${children}`;
  }).join('');
}

function openCreateNodeModal(projectId, parentId) {
  openModal('Create File or Directory',
    `<div class="form-body">
      <div class="form-field">
        <label>Name</label>
        <input id="m-node-name" type="text" placeholder="index.js" />
      </div>
      <div class="form-field">
        <label>Type</label>
        <select id="m-node-type">
          <option value="file">File</option>
          <option value="dir">Directory</option>
        </select>
      </div>
    </div>`,
    `<button class="btn btn-ghost" id="m-cancel-node">Cancel</button>
     <button class="btn btn-primary" id="m-create-node">Create</button>`
  );
  $('m-cancel-node').addEventListener('click', closeModal);
  $('m-create-node').addEventListener('click', async () => {
    const name = $('m-node-name').value.trim();
    const type = $('m-node-type').value;
    if (!name) { toast('Name is required', 'error'); return; }
    try {
      await api('POST', `/projects/${projectId}/tree`, { name, type, parent_id: parentId || undefined });
      toast('Created!', 'success');
      closeModal();
    } catch (err) {
      toast(err.message, 'error');
    }
  });
}

// ── ─────────────────────────────────────────────────
// VIEW: MEMBERS
// ─────────────────────────────────────────────────────
async function renderMembersView(container) {
  const isSA = state.user?.role === 'superadmin';

  // Load projects for selector
  let projects = [];
  try {
    const data = await api('GET', '/projects?limit=100');
    projects = data.items || [];
  } catch (e) {
    container.innerHTML = `<p class="text-danger">${e.message}</p>`;
    return;
  }

  if (projects.length === 0) {
    container.innerHTML = '<div class="empty-state"><div class="empty-icon">👥</div><h3>No projects</h3><p>Create a project first.</p></div>';
    return;
  }

  // Default to selected or first
  if (!state.selectedProjectId || !projects.find(p => p.id === state.selectedProjectId)) {
    state.selectedProjectId = projects[0].id;
  }

  const wrap = el('div');
  wrap.innerHTML = `
    <div class="section-header">
      <div class="flex gap-8 align-center">
        <label for="proj-select" class="text-secondary" style="font-size:12px;white-space:nowrap">Project:</label>
        <select id="proj-select" style="background:var(--bg-surface);border:1px solid var(--border);color:var(--text-primary);padding:5px 10px;border-radius:6px;font-size:13px">
          ${projects.map(p => `<option value="${p.id}" ${p.id === state.selectedProjectId ? 'selected' : ''}>${escHtml(p.name)}</option>`).join('')}
        </select>
      </div>
      <div id="members-header-actions"></div>
    </div>
    <div class="table-wrap" id="members-table-wrap"></div>`;
  container.innerHTML = '';
  container.appendChild(wrap);

  $('topbar-action-btn').hidden = true;

  const tableWrap = $('members-table-wrap');

  async function reloadTable(projectId) {
    await loadMembersTable(tableWrap, projectId, isSA, $('members-header-actions'));
  }

  await reloadTable(state.selectedProjectId);

  $('proj-select').addEventListener('change', async (e) => {
    state.selectedProjectId = e.target.value;
    setLoading(tableWrap, true);
    await reloadTable(state.selectedProjectId);
  });
}

async function loadMembersTable(tableWrap, projectId, isSA, actionsEl) {
  setLoading(tableWrap, true);
  if (actionsEl) actionsEl.innerHTML = '';
  try {
    const members = await api('GET', `/projects/${projectId}/members`);

    // Determine if current user can manage this project
    const myMembership = members.find(m => m.user_id === state.user?.id);
    const canManage = isSA || (myMembership?.role === 'lead');

    // Render Add Member button now that we know the role
    if (actionsEl && canManage) {
      actionsEl.innerHTML = `<button class="btn btn-primary btn-sm" id="add-member-btn">+ Add Member</button>`;
      $('add-member-btn').addEventListener('click', () => openAddMemberModal(projectId, tableWrap, isSA, actionsEl));
    }

    if (members.length === 0) {
      tableWrap.innerHTML = '<div class="empty-state"><div class="empty-icon">👤</div><p>No members yet</p></div>';
      return;
    }
    tableWrap.innerHTML = `
      <table>
        <thead><tr>
          <th>Username</th><th>Email</th><th>Role</th><th>Granted</th>${canManage ? '<th>Actions</th>' : ''}
        </tr></thead>
        <tbody>
          ${members.map(m => `
            <tr data-uid="${m.user_id}">
              <td><strong>${escHtml(m.username)}</strong></td>
              <td class="td-mono">${escHtml(m.email)}</td>
              <td><span class="badge-role ${m.role}">${m.role}</span></td>
              <td class="td-mono">${new Date(m.created_at).toLocaleDateString()}</td>
              ${canManage ? `<td><button class="btn btn-danger btn-sm revoke-btn" data-uid="${m.user_id}" data-uname="${escHtml(m.username)}">Revoke</button></td>` : ''}
            </tr>`).join('')}
        </tbody>
      </table>`;

    if (canManage) {
      tableWrap.querySelectorAll('.revoke-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
          if (!confirm(`Revoke access for ${btn.dataset.uname}?`)) return;
          try {
            await api('DELETE', `/projects/${projectId}/members/${btn.dataset.uid}`);
            toast('Access revoked', 'success');
            await loadMembersTable(tableWrap, projectId, isSA, actionsEl);
          } catch (err) { toast(err.message, 'error'); }
        });
      });
    }
  } catch (e) {
    tableWrap.innerHTML = `<p class="text-danger" style="padding:16px">${e.message}</p>`;
  }
}

function openAddMemberModal(projectId, tableWrap, isSA, actionsEl) {
  openModal('Add Member',
    `<div class="form-body">
      <div class="form-field">
        <label>Email Address</label>
        <input id="m-email" type="email" placeholder="user@example.com" />
      </div>
      <div class="form-field">
        <label>Role</label>
        <select id="m-role">
          <option value="member">Member</option>
          <option value="lead">Lead (Admin)</option>
        </select>
      </div>
      <p class="text-muted mt-8" style="font-size:11px">⚠️ User must already have an account. Create them first in <strong>User Management</strong> if they don't exist yet.</p>
    </div>`,
    `<button class="btn btn-ghost" id="m-cancel-member">Cancel</button>
     <button class="btn btn-primary" id="m-add-member">Add Member</button>`
  );
  $('m-cancel-member').addEventListener('click', closeModal);
  $('m-add-member').addEventListener('click', async () => {
    const email = $('m-email').value.trim();
    const role  = $('m-role').value;
    if (!email) { toast('Email is required', 'error'); return; }
    try {
      const res = await api('POST', `/projects/${projectId}/members`, { email, role });
      closeModal();
      
      if (res.temp_password) {
        openModal('Account Created!',
          `<div class="form-body text-center">
            <p>A new account was created for <strong>${escHtml(email)}</strong>.</p>
            <div style="background:var(--bg-canvas);padding:16px;margin:16px 0;border-radius:6px;border:1px dashed var(--border);">
              <span style="font-family:monospace;font-size:18px;color:var(--accent-blue);">${escHtml(res.temp_password)}</span>
            </div>
            <p class="text-danger" style="font-size:12px;">Copy this temporary password now. You will not be able to see it again!</p>
          </div>`,
          `<button class="btn btn-primary btn-full" onclick="closeModal()">I've copied it</button>`
        );
      } else {
        toast('Member added!', 'success');
      }
      
      await loadMembersTable(tableWrap, projectId, isSA, actionsEl);
    } catch (err) { toast(err.message, 'error'); }
  });
}

// ── ─────────────────────────────────────────────────
// VIEW: AUDIT LOGS
// ─────────────────────────────────────────────────────
let logsPage = 1;
const LOG_PAGE_SIZE = 50;

async function renderLogsView(container) {
  $('topbar-action-btn').hidden = true;
  logsPage = 1;
  container.innerHTML = `
    <div class="table-wrap">
      <div class="table-toolbar">
        <div class="table-search"><input id="log-filter-action" placeholder="Filter by action (e.g. create, login…)" /></div>
        <div class="flex gap-8">
          <button class="btn btn-ghost btn-sm" id="logs-refresh">↺ Refresh</button>
        </div>
      </div>
      <div id="logs-body"></div>
      <div class="pagination" id="logs-pagination"></div>
    </div>`;

  await loadLogsPage();

  $('logs-refresh').addEventListener('click', () => { logsPage = 1; loadLogsPage(); });
  let filterTimer;
  $('log-filter-action').addEventListener('input', () => {
    clearTimeout(filterTimer);
    filterTimer = setTimeout(() => { logsPage = 1; loadLogsPage(); }, 400);
  });
}

async function loadLogsPage() {
  const body = $('logs-body');
  const pag  = $('logs-pagination');
  if (!body) return;
  setLoading(body, true);

  const actionFilter = ($('log-filter-action')?.value || '').trim();
  let url = `/logs?page=${logsPage}&page_size=${LOG_PAGE_SIZE}`;
  if (actionFilter) url += `&action=${encodeURIComponent(actionFilter)}`;

  try {
    const data = await api('GET', url);
    const logs = data.items || [];
    const totalPages = Math.ceil(data.total / LOG_PAGE_SIZE);

    if (logs.length === 0) {
      body.innerHTML = '<div class="empty-state"><div class="empty-icon">📋</div><p>No audit logs found</p></div>';
      pag.innerHTML = '';
      return;
    }

    body.innerHTML = `
      <table>
        <thead><tr>
          <th>Time</th><th>Action</th><th>Resource</th><th>Actor</th><th>Detail</th>
        </tr></thead>
        <tbody>
          ${logs.map(l => `
            <tr>
              <td class="td-mono" style="white-space:nowrap">${new Date(l.created_at).toLocaleString()}</td>
              <td><span class="log-action ${l.action}">${l.action}</span></td>
              <td><span class="td-mono">${l.resource_type}</span></td>
              <td class="td-mono">${l.actor_id ? l.actor_id.slice(0,8) + '…' : 'system'}</td>
              <td class="td-mono" style="font-size:11px;max-width:240px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title='${escHtml(JSON.stringify(l.detail))}'>${escHtml(JSON.stringify(l.detail))}</td>
            </tr>`).join('')}
        </tbody>
      </table>`;

    pag.innerHTML = `
      <button class="btn btn-ghost btn-sm" id="logs-prev" ${logsPage <= 1 ? 'disabled' : ''}>← Prev</button>
      <span class="page-info">Page ${logsPage} of ${totalPages} (${data.total} total)</span>
      <button class="btn btn-ghost btn-sm" id="logs-next" ${logsPage >= totalPages ? 'disabled' : ''}>Next →</button>`;

    $('logs-prev')?.addEventListener('click', () => { logsPage--; loadLogsPage(); });
    $('logs-next')?.addEventListener('click', () => { logsPage++; loadLogsPage(); });

  } catch (e) {
    body.innerHTML = `<p class="text-danger" style="padding:16px">${e.message}</p>`;
  }
}

// ── ─────────────────────────────────────────────────
// VIEW: USERS (superadmin only)
// ─────────────────────────────────────────────────────
async function renderUsersView(container) {
  if (state.user?.role !== 'superadmin') return;

  const actionBtn = $('topbar-action-btn');
  actionBtn.hidden = false;
  actionBtn.textContent = '+ New User';
  actionBtn.onclick = () => openCreateUserModal();

  container.innerHTML = `
    <div class="table-wrap">
      <div class="table-toolbar">
        <div class="table-search"><input id="user-search" placeholder="Search by email or username…" /></div>
      </div>
      <div id="users-body"></div>
    </div>`;

  await loadUsersTable();
  let timer;
  $('user-search').addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(loadUsersTable, 400); });
}

async function loadUsersTable() {
  const body = $('users-body');
  if (!body) return;
  setLoading(body, true);

  try {
    const data = await api('GET', '/users?limit=200');
    let users = data.items || [];

    const q = ($('user-search')?.value || '').toLowerCase();
    if (q) users = users.filter(u => u.email.toLowerCase().includes(q) || u.username.toLowerCase().includes(q));

    if (users.length === 0) {
      body.innerHTML = '<div class="empty-state"><div class="empty-icon">👤</div><p>No users found</p></div>';
      return;
    }

    body.innerHTML = `
      <table>
        <thead><tr>
          <th>Username</th><th>Email</th><th>Global Role</th><th>Status</th><th>Created</th><th>Actions</th>
        </tr></thead>
        <tbody>
          ${users.map(u => `
            <tr>
              <td><strong>${escHtml(u.username)}</strong><br/><span class="td-mono" style="font-size:10px">${u.id}</span></td>
              <td class="td-mono">${escHtml(u.email)}</td>
              <td><span class="badge-role ${u.role}">${u.role}</span></td>
              <td><span class="chip ${u.is_active ? 'active' : 'inactive'}">${u.is_active ? '● Active' : '● Inactive'}</span></td>
              <td class="td-mono">${new Date(u.created_at).toLocaleDateString()}</td>
              <td>
                <div class="flex gap-8">
                  <button class="btn btn-ghost btn-sm edit-user-btn" data-id="${u.id}" data-username="${escHtml(u.username)}" data-email="${escHtml(u.email)}" data-role="${u.role}">Edit</button>
                  <button class="btn btn-danger btn-sm toggle-user-btn" data-id="${u.id}" data-active="${u.is_active}" data-uname="${escHtml(u.username)}">${u.is_active ? 'Deactivate' : 'Reactivate'}</button>
                </div>
              </td>
            </tr>`).join('')}
        </tbody>
      </table>`;

    body.querySelectorAll('.edit-user-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        openEditUserModal(btn.dataset.id, btn.dataset.username, btn.dataset.email, btn.dataset.role);
      });
    });

    body.querySelectorAll('.toggle-user-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const isActive = btn.dataset.active === 'true';
        const action = isActive ? 'deactivate' : 'reactivate';
        if (!confirm(`${action.charAt(0).toUpperCase() + action.slice(1)} user "${btn.dataset.uname}"?`)) return;
        try {
          await api('PATCH', `/users/${btn.dataset.id}`, { is_active: !isActive });
          toast(`User ${action}d`, 'success');
          await loadUsersTable();
        } catch (err) { toast(err.message, 'error'); }
      });
    });

  } catch (e) {
    body.innerHTML = `<p class="text-danger" style="padding:16px">${e.message}</p>`;
  }
}

function openCreateUserModal() {
  // Generate a readable temp password up front
  const tempPw = 'tmp-' + Math.random().toString(36).slice(2, 10);

  openModal('Create User',
    `<div class="form-body">
      <div class="form-field"><label>Email</label><input id="m-new-email" type="email" placeholder="john@example.com" /></div>
      <div class="form-field"><label>Username</label><input id="m-new-username" type="text" placeholder="johndoe" /></div>
      <div class="form-field">
        <label>Global Role</label>
        <select id="m-new-role">
          <option value="member">Member</option>
          <option value="superadmin">Superadmin</option>
        </select>
      </div>
      <div class="form-field" style="background:var(--bg-canvas);padding:12px;border-radius:6px;border:1px dashed var(--border);">
        <label style="color:var(--text-secondary)">Temporary Password (auto-generated)</label>
        <div style="font-family:monospace;font-size:15px;color:var(--accent-blue);margin-top:4px;">${escHtml(tempPw)}</div>
        <p class="text-danger" style="font-size:11px;margin-top:4px;">Copy this now — user must change it on first login.</p>
      </div>
    </div>`,
    `<button class="btn btn-ghost" id="m-cancel-cu">Cancel</button>
     <button class="btn btn-primary" id="m-create-user-btn">Create User</button>`
  );
  $('m-cancel-cu').addEventListener('click', closeModal);
  $('m-create-user-btn').addEventListener('click', async () => {
    const email    = $('m-new-email').value.trim();
    const username = $('m-new-username').value.trim();
    const role     = $('m-new-role').value;
    if (!email || !username) { toast('Email and username are required', 'error'); return; }
    try {
      await api('POST', '/users', { username, email, password: tempPw, role });
      // Mark requires_password_change via PATCH
      const users = await api('GET', `/users?limit=200`);
      const created = (users.items || []).find(u => u.email === email);
      if (created) await api('PATCH', `/users/${created.id}`, { requires_password_change: true });
      closeModal();
      toast('User created! Share the temporary password with them.', 'success');
      await loadUsersTable();
    } catch (err) { toast(err.message, 'error'); }
  });
}

function openEditUserModal(userId, username, email, role) {
  openModal('Edit User',
    `<div class="form-body">
      <div class="form-field"><label>Username</label><input id="m-edit-username" type="text" value="${escHtml(username)}" /></div>
      <div class="form-field"><label>Email</label><input id="m-edit-email" type="email" value="${escHtml(email)}" /></div>
      <div class="form-field"><label>New Password (leave blank to keep)</label><input id="m-edit-pass" type="password" placeholder="Optional" /></div>
      <div class="form-field">
        <label>Global Role</label>
        <select id="m-edit-role">
          <option value="member" ${role==='member'?'selected':''}>Member</option>
          <option value="admin" ${role==='admin'?'selected':''}>Admin</option>
          <option value="superadmin" ${role==='superadmin'?'selected':''}>Superadmin</option>
        </select>
      </div>
    </div>`,
    `<button class="btn btn-ghost" id="m-cancel-eu">Cancel</button>
     <button class="btn btn-primary" id="m-save-user-btn">Save Changes</button>`
  );
  $('m-cancel-eu').addEventListener('click', closeModal);
  $('m-save-user-btn').addEventListener('click', async () => {
    const updates = {
      username: $('m-edit-username').value.trim() || undefined,
      email:    $('m-edit-email').value.trim() || undefined,
      role:     $('m-edit-role').value,
    };
    const pass = $('m-edit-pass').value;
    if (pass) updates.password = pass;
    try {
      await api('PATCH', `/users/${userId}`, updates);
      toast('User updated!', 'success');
      closeModal();
      await loadUsersTable();
    } catch (err) { toast(err.message, 'error'); }
  });
}

// ── Util ─────────────────────────────────────────────
function escHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ── Boot ─────────────────────────────────────────────
async function boot() {
  if (!state.token) {
    // Show login screen
    hide('app');
    show('login-screen');

    $('login-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const errEl = $('login-error');
      errEl.hidden = true;
      const btn = $('login-btn');
      btn.textContent = 'Signing in…';
      btn.disabled = true;
      try {
        await login($('login-email').value, $('login-password').value);
        boot();
      } catch (err) {
        errEl.textContent = err.message;
        errEl.hidden = false;
        btn.textContent = 'Sign in';
        btn.disabled = false;
      }
    });
    return;
  }

  // Validate token
  try {
    const me = await api('GET', '/auth/me');
    state.user = me;
    localStorage.setItem('nulltor_user', JSON.stringify(me));
  } catch (_) {
    logout();
    return;
  }

  hide('login-screen');

  // Handle forced password change
  if (state.user.requires_password_change) {
    hide('app');
    show('force-password-screen');
    
    const forceForm = $('force-password-form');
    // Remove existing listener to prevent duplicates if boot() is called multiple times
    const newForceForm = forceForm.cloneNode(true);
    forceForm.parentNode.replaceChild(newForceForm, forceForm);
    
    newForceForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const errEl = $('force-password-error');
      errEl.hidden = true;
      const btn = $('force-password-btn');
      btn.textContent = 'Updating…';
      btn.disabled = true;
      try {
        await api('POST', '/auth/change-password', {
          old_password: $('force-old-password').value,
          new_password: $('force-new-password').value
        });
        hide('force-password-screen');
        boot(); // re-boot to fetch updated user state
      } catch (err) {
        errEl.textContent = err.message;
        errEl.hidden = false;
        btn.textContent = 'Update Password';
        btn.disabled = false;
      }
    });
    return;
  }

  show('app');
  renderUserPill();
  initNav();

  window.addEventListener('hashchange', navigate);
  navigate();
}

boot();
