const $ = (id) => document.getElementById(id);
const msg = (text, error) => { $('msg').textContent = text || ''; $('msg').className = error ? 'err' : ''; };

let challenge = '';

async function post(path, body) {
  const res = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Erro inesperado.');
  return data;
}

function show(which) {
  for (const id of ['login-form', 'code-form', 'reset-form']) $(id).hidden = id !== which;
  msg('');
}

// Roda a ação com o botão do formulário desabilitado e mostra o erro, se houver.
function submit(formId, fn) {
  $(formId).addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = e.submitter; btn.disabled = true; msg('');
    try { await fn(); } catch (err) { msg(err.message, true); } finally { btn.disabled = false; }
  });
}

// 1ª etapa
submit('login-form', async () => {
  const data = await post('/api/auth/login', { cpf: $('cpf').value, password: $('password').value });
  challenge = data.challenge;
  $('password').value = '';
  show('code-form');
  msg(data.message);
  $('code').focus();
});

// 2ª etapa
submit('code-form', async () => {
  const data = await post('/api/auth/verify-code', { challenge, code: $('code').value });
  try { sessionStorage.setItem('resident-token', data.token); } catch {}
  window.location.href = '/app.html';
});

$('resend').addEventListener('click', async () => {
  try { msg((await post('/api/auth/resend-code', { challenge })).message); } catch (err) { msg(err.message, true); }
});

// Primeiro acesso / esqueci a senha
let resetSent = false;
function resetForm() {
  resetSent = false;
  $('reset-step2').hidden = true;
  $('reset-submit').textContent = 'Enviar código por e-mail';
  for (const id of ['reset-code', 'new-password', 'new-password2']) { $(id).value = ''; $(id).required = false; }
}

submit('reset-form', async () => {
  if (!resetSent) {
    const data = await post('/api/auth/password/request', { cpf: $('reset-cpf').value });
    resetSent = true;
    $('reset-step2').hidden = false;
    for (const id of ['reset-code', 'new-password', 'new-password2']) $(id).required = true;
    $('reset-submit').textContent = 'Salvar senha';
    msg(data.message);
    $('reset-code').focus();
    return;
  }
  if ($('new-password').value !== $('new-password2').value) throw new Error('As senhas não são iguais.');
  const data = await post('/api/auth/password/confirm', { cpf: $('reset-cpf').value, code: $('reset-code').value, password: $('new-password').value });
  $('cpf').value = $('reset-cpf').value;
  resetForm();
  show('login-form');
  msg(data.message);
  $('password').focus();
});

$('to-reset').addEventListener('click', () => { $('reset-cpf').value = $('cpf').value; resetForm(); show('reset-form'); });
for (const id of ['back-login', 'back-login2']) $(id).addEventListener('click', () => { challenge = ''; show('login-form'); });
