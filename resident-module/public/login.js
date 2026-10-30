const $ = (id) => document.getElementById(id);
const msg = (text, error) => { $('msg').textContent = text || ''; $('msg').className = error ? 'err' : ''; };

async function post(path, body) {
  const res = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Erro inesperado.');
  return data;
}

$('cpf-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = e.submitter; btn.disabled = true; msg('');
  try {
    const data = await post('/api/auth/request-code', { cpf: $('cpf').value });
    msg(data.message);
    $('code-form').hidden = false; $('code').focus();
  } catch (err) { msg(err.message, true); } finally { btn.disabled = false; }
});

$('code-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = e.submitter; btn.disabled = true; msg('');
  try {
    const data = await post('/api/auth/verify-code', { cpf: $('cpf').value, code: $('code').value });
    try { sessionStorage.setItem('resident-token', data.token); } catch {}
    $('cpf-form').hidden = true; $('code-form').hidden = true;
    $('who').textContent = 'Olá, ' + data.resident.name; $('logged').hidden = false; msg('');
  } catch (err) { msg(err.message, true); } finally { btn.disabled = false; }
});
