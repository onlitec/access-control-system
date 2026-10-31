const $ = (id) => document.getElementById(id);
const STATUS = {
  PENDING_APPROVAL: ['Aguardando', 'warn'], APPROVING: ['Aprovando', 'warn'], APPROVED: ['Liberado', 'ok'],
  REJECTED: ['Recusado', 'err'], CANCELLED: ['Cancelado', 'err'],
};
const STATE = { OPEN: ['Aberto', 'ok'], USED: ['Usado', 'ok'], EXPIRED: ['Vencido', 'err'], CANCELLED: ['Cancelado', 'err'] };

let token = '';
try { token = sessionStorage.getItem('resident-token') || ''; } catch {}
if (!token) window.location.replace('/');

function msg(text, error) { $('msg').textContent = text || ''; $('msg').className = error ? 'err' : ''; }

async function api(method, path, body) {
  const res = await fetch('/api' + path, {
    method,
    headers: { Authorization: 'Bearer ' + token, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 401) { try { sessionStorage.removeItem('resident-token'); } catch {} window.location.replace('/'); throw new Error('Sessão expirada.'); }
  if (res.status === 204) return null;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Erro inesperado.');
  return data;
}

// Tudo que vem de visitantes é inserido com textContent (nunca innerHTML).
function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === 'class') node.className = v; else if (k === 'text') node.textContent = v;
    else if (k.startsWith('on')) node.addEventListener(k.slice(2), v); else node.setAttribute(k, v);
  }
  node.append(...children.filter(Boolean));
  return node;
}
const tag = (map, key) => { const [text, cls] = map[key] || [key, 'warn']; return el('span', { class: 'tag ' + cls, text }); };
const fmtDay = (d) => d.split('-').reverse().join('/');

async function photo(id, kind) {
  const res = await fetch(`/api/visits/${id}/photo/${kind}`, { headers: { Authorization: 'Bearer ' + token } });
  if (!res.ok) return null;
  const img = el('img', { alt: kind === 'face' ? 'Foto do rosto' : 'Foto do documento' });
  img.src = URL.createObjectURL(await res.blob());
  img.addEventListener('click', () => window.open(img.src, '_blank', 'noopener'));
  return img;
}

async function act(button, fn) {
  button.disabled = true; msg('');
  try { await fn(); await refresh(); } catch (err) { msg(err.message, true); } finally { button.disabled = false; }
}

function visitHeader(v) {
  const who = `${v.name} ${v.surname}` + (v.type === 'PROVIDER' ? ' (prestador)' : '');
  const details = [fmtDay(v.visitDate), v.phone, v.document && 'Doc. ' + v.document, v.company, v.plate && 'Placa ' + v.plate].filter(Boolean).join(' · ');
  return [el('b', { text: who }), el('span', { class: 'muted', text: details })];
}

async function renderPending(visits) {
  const box = $('pending'); box.replaceChildren();
  if (!visits.length) { box.append(el('p', { text: 'Nenhum cadastro aguardando.' })); return; }
  for (const v of visits) {
    const photos = el('div', { class: 'photos' });
    const approve = el('button', { text: 'Aprovar' });
    const reject = el('button', { class: 'secondary danger', text: 'Recusar' });
    approve.addEventListener('click', () => act(approve, () => api('POST', `/visits/${v.id}/approve`)));
    reject.addEventListener('click', () => {
      const reason = window.prompt('Motivo da recusa (opcional):');
      if (reason === null) return;
      act(reject, () => api('POST', `/visits/${v.id}/reject`, { reason }));
    });
    box.append(el('div', { class: 'item' }, ...visitHeader(v), photos,
      v.hikError && el('p', { class: 'muted', text: 'Última tentativa: ' + v.hikError }),
      el('div', { class: 'row' }, approve, reject)));
    for (const kind of ['face', 'document']) photo(v.id, kind).then((img) => img && photos.append(img));
  }
}

function renderInvites(invites) {
  const box = $('invites'); box.replaceChildren();
  if (!invites.length) { box.append(el('p', { text: 'Você ainda não criou convites.' })); return; }
  for (const i of invites) {
    const copy = el('button', { class: 'secondary', text: 'Copiar link' });
    copy.addEventListener('click', async () => { await navigator.clipboard.writeText(i.link).catch(() => {}); msg('Link copiado.'); });
    const row = el('div', { class: 'row' });
    if (i.state === 'OPEN') {
      const cancel = el('button', { class: 'secondary danger', text: 'Cancelar' });
      cancel.addEventListener('click', () => act(cancel, () => api('DELETE', `/invites/${i.id}`)));
      row.append(copy, cancel);
    }
    box.append(el('div', { class: 'item' },
      el('b', { text: (i.label || (i.type === 'PROVIDER' ? 'Prestador' : 'Visitante')) }),
      el('span', { class: 'muted', text: `até ${fmtDay(i.validUntil)}` + (i.visit ? ` · ${i.visit.name} ${i.visit.surname}` : '') + (i.allowVehicle ? ' · com veículo' : '') + ' '  }),
      tag(STATE, i.state), row));
  }
}

function renderHistory(visits) {
  const box = $('history'); box.replaceChildren();
  if (!visits.length) { box.append(el('p', { text: 'Sem histórico ainda.' })); return; }
  for (const v of visits) {
    const row = el('div', { class: 'row' });
    if (v.status === 'APPROVED') {
      const cancel = el('button', { class: 'secondary danger', text: 'Cancelar acesso' });
      cancel.addEventListener('click', () => { if (window.confirm('Cancelar o acesso deste visitante?')) act(cancel, () => api('POST', `/visits/${v.id}/cancel`)); });
      row.append(cancel);
    }
    box.append(el('div', { class: 'item' }, ...visitHeader(v), tag(STATUS, v.status),
      v.rejectReason && el('span', { class: 'muted', text: ' Motivo: ' + v.rejectReason }), row));
  }
}

async function refresh() {
  const [invites, visits] = await Promise.all([api('GET', '/invites'), api('GET', '/visits')]);
  renderPending(visits.filter((v) => v.status === 'PENDING_APPROVAL' || v.status === 'APPROVING'));
  renderInvites(invites);
  renderHistory(visits.filter((v) => !['PENDING_APPROVAL', 'APPROVING'].includes(v.status)));
}

$('invite-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = e.submitter; btn.disabled = true; msg('');
  try {
    const res = await api('POST', '/invites', {
      type: $('type').value, label: $('label').value, validUntil: $('until').value,
      allowVehicle: $('vehicle').checked, recipient: $('recipient').value,
    });
    const text = 'Você foi convidado(a) para uma visita. Faça seu cadastro por este link: ' + res.link;
    $('created-link').textContent = res.link;
    $('copy').onclick = async () => { await navigator.clipboard.writeText(res.link).catch(() => {}); msg('Link copiado.'); };
    $('share-wa').href = 'https://wa.me/?text=' + encodeURIComponent(text);
    $('share-mail').href = 'mailto:?subject=' + encodeURIComponent('Convite de visita') + '&body=' + encodeURIComponent(text);
    $('created').hidden = false;
    msg(res.sent ? 'Convite criado e enviado.' : 'Convite criado. Compartilhe o link com o visitante.');
    $('label').value = ''; $('recipient').value = '';
    await refresh();
  } catch (err) { msg(err.message, true); } finally { btn.disabled = false; }
});

$('logout').addEventListener('click', () => { try { sessionStorage.removeItem('resident-token'); } catch {} window.location.replace('/'); });

(async () => {
  const d = new Date(Date.now() + 7 * 864e5);
  $('until').value = [d.getFullYear(), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0')].join('-');
  try {
    const me = await api('GET', '/auth/me');
    $('who').textContent = 'Olá, ' + me.name;
    await refresh();
    setInterval(() => refresh().catch(() => {}), 30000);
  } catch (err) { msg(err.message, true); }
})();
