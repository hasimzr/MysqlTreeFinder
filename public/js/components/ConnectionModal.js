/**
 * MySQL Tree Schema Finder - Connection & Password Prompt Modal Component
 */

import { addOrUpdateConnection } from '../services/apiService.js';
import { showToast } from '../utils.js';

let pendingPromptConn = null;

export function showModal(connToEdit = null) {
  hideError();

  const editingConnId = document.getElementById('editing-conn-id');
  const dbTitleInput = document.getElementById('db-title');
  const dbHost = document.getElementById('db-host');
  const dbPort = document.getElementById('db-port');
  const dbUser = document.getElementById('db-user');
  const dbPassword = document.getElementById('db-password');
  const dbName = document.getElementById('db-name');
  const dbSsl = document.getElementById('db-ssl');
  const dbAskPassword = document.getElementById('db-ask-password');
  const dbSave = document.getElementById('db-save');
  const modalHeading = document.getElementById('modal-heading');
  const modalSubheading = document.getElementById('modal-subheading');
  const modal = document.getElementById('connection-modal');

  if (connToEdit) {
    if (editingConnId) editingConnId.value = connToEdit.id;
    if (dbTitleInput) dbTitleInput.value = connToEdit.title || '';
    if (dbHost) dbHost.value = connToEdit.host || 'localhost';
    if (dbPort) dbPort.value = connToEdit.port || 3306;
    if (dbUser) dbUser.value = connToEdit.user || 'root';
    if (dbPassword) dbPassword.value = connToEdit.password || '';
    if (dbName) dbName.value = connToEdit.database || '';
    if (dbSsl) dbSsl.checked = !!connToEdit.ssl;
    if (dbAskPassword) dbAskPassword.checked = !!connToEdit.askPassword;
    if (dbSave) dbSave.checked = true;
    if (modalHeading) modalHeading.textContent = 'Bağlantıyı Düzenle';
    if (modalSubheading) modalSubheading.textContent = 'Kayıtlı sunucu parametrelerini güncelleyin.';
  } else {
    if (editingConnId) editingConnId.value = '';
    if (dbTitleInput) dbTitleInput.value = '';
    if (dbHost) dbHost.value = 'localhost';
    if (dbPort) dbPort.value = 3306;
    if (dbUser) dbUser.value = 'root';
    if (dbPassword) dbPassword.value = '';
    if (dbName) dbName.value = '';
    if (dbSsl) dbSsl.checked = false;
    if (dbAskPassword) dbAskPassword.checked = false;
    if (dbSave) dbSave.checked = true;
    if (modalHeading) modalHeading.textContent = 'Yeni MySQL Veritabanı Bağlantısı';
    if (modalSubheading) modalSubheading.textContent = 'Şema ağacını listelemek için sunucu erişim bilgilerinizi girin.';
  }

  if (modal) modal.classList.remove('hidden');
}

export function hideModal() {
  const modal = document.getElementById('connection-modal');
  if (modal) modal.classList.add('hidden');
  hideError();
}

export function showPasswordPromptModal(conn) {
  pendingPromptConn = conn;
  const promptConnTitle = document.getElementById('prompt-conn-title');
  const promptPasswordInput = document.getElementById('prompt-password-input');
  const promptError = document.getElementById('prompt-error');
  const promptModal = document.getElementById('password-prompt-modal');

  if (promptConnTitle) promptConnTitle.textContent = conn.title || `${conn.user}@${conn.host}`;
  if (promptPasswordInput) promptPasswordInput.value = '';
  if (promptError) {
    promptError.classList.add('hidden');
    promptError.textContent = '';
  }
  if (promptModal) {
    promptModal.classList.remove('hidden');
    setTimeout(() => promptPasswordInput && promptPasswordInput.focus(), 100);
  }
}

export function hidePasswordPromptModal() {
  pendingPromptConn = null;
  const promptModal = document.getElementById('password-prompt-modal');
  const promptError = document.getElementById('prompt-error');
  if (promptModal) promptModal.classList.add('hidden');
  if (promptError) promptError.classList.add('hidden');
}

export function setupModalEvents(callbacks = {}) {
  const { attemptConnectionCb, renderConnectionsCb } = callbacks;

  const btnModalClose = document.getElementById('btn-modal-close');
  const btnModalCancel = document.getElementById('btn-modal-cancel');
  const connForm = document.getElementById('connection-form');
  const btnDemoMode = document.getElementById('btn-demo-mode');

  const btnPromptClose = document.getElementById('btn-prompt-close');
  const btnPromptCancel = document.getElementById('btn-prompt-cancel');
  const promptForm = document.getElementById('password-prompt-form');

  if (btnModalClose) btnModalClose.addEventListener('click', hideModal);
  if (btnModalCancel) btnModalCancel.addEventListener('click', hideModal);

  if (btnPromptClose) btnPromptClose.addEventListener('click', hidePasswordPromptModal);
  if (btnPromptCancel) btnPromptCancel.addEventListener('click', hidePasswordPromptModal);

  // Form Submission (Create or Edit Connection)
  if (connForm) {
    connForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const editingId = document.getElementById('editing-conn-id').value;
      const titleVal = document.getElementById('db-title').value.trim();
      const dbAskPassword = document.getElementById('db-ask-password');
      const askPasswordVal = dbAskPassword ? dbAskPassword.checked : false;

      const creds = {
        host: document.getElementById('db-host').value.trim(),
        port: parseInt(document.getElementById('db-port').value.trim()) || 3306,
        user: document.getElementById('db-user').value.trim(),
        password: document.getElementById('db-password').value,
        database: document.getElementById('db-name').value.trim(),
        ssl: document.getElementById('db-ssl').checked,
        askPassword: askPasswordVal,
        isMock: false
      };

      const dbSave = document.getElementById('db-save');
      const shouldSave = dbSave ? dbSave.checked : true;

      if (askPasswordVal && !creds.password) {
        if (shouldSave) {
          const connObj = {
            id: editingId || ('conn-' + Date.now()),
            title: titleVal || `${creds.user}@${creds.host}`,
            ...creds,
            password: '',
            lastUsed: Date.now()
          };
          addOrUpdateConnection(connObj, renderConnectionsCb);
          hideModal();
          showToast('Canlı sunucu bağlantısı kaydedildi. Bağlanırken şifre sorulacak.');
        }
        return;
      }

      if (typeof attemptConnectionCb === 'function') {
        const success = await attemptConnectionCb(creds);
        if (success && shouldSave) {
          const connObj = {
            id: editingId || ('conn-' + Date.now()),
            title: titleVal || `${creds.user}@${creds.host}`,
            ...creds,
            password: askPasswordVal ? '' : creds.password,
            lastUsed: Date.now()
          };
          addOrUpdateConnection(connObj, renderConnectionsCb);
        }
      }
    });
  }

  // Demo Mode Button Click
  if (btnDemoMode) {
    btnDemoMode.addEventListener('click', async () => {
      const creds = {
        host: 'demo.mysql.internal',
        port: 3306,
        user: 'demo_user',
        password: 'demo_password',
        database: 'ecommerce_prod',
        ssl: false,
        isMock: true
      };
      if (typeof attemptConnectionCb === 'function') {
        await attemptConnectionCb(creds);
      }
    });
  }

  // Password Prompt Form Submission
  if (promptForm) {
    promptForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!pendingPromptConn) return;

      const promptPasswordInput = document.getElementById('prompt-password-input');
      const promptError = document.getElementById('prompt-error');
      const enteredPassword = promptPasswordInput.value;
      const tempCreds = {
        ...pendingPromptConn,
        password: enteredPassword
      };

      const btnText = promptForm.querySelector('.btn-text');
      const spinner = promptForm.querySelector('.btn-spinner');
      if (btnText && spinner) {
        btnText.style.display = 'none';
        spinner.classList.remove('hidden');
      }

      try {
        if (typeof attemptConnectionCb === 'function') {
          const success = await attemptConnectionCb(tempCreds);
          if (success) {
            hidePasswordPromptModal();
            addOrUpdateConnection({ ...pendingPromptConn, lastUsed: Date.now() }, renderConnectionsCb);
          }
        }
      } catch (err) {
        if (promptError) {
          promptError.textContent = err.message || 'Bağlantı kurulamadı.';
          promptError.classList.remove('hidden');
        }
      } finally {
        if (btnText && spinner) {
          btnText.style.display = 'inline-block';
          spinner.classList.add('hidden');
        }
      }
    });
  }
}

export function showError(msg) {
  const connError = document.getElementById('connection-error');
  if (connError) {
    connError.textContent = msg;
    connError.classList.remove('hidden');
  }
}

export function hideError() {
  const connError = document.getElementById('connection-error');
  if (connError) connError.classList.add('hidden');
}

export function setLoadingState(isLoading) {
  const btnConnect = document.getElementById('btn-connect');
  if (!btnConnect) return;

  const spinner = btnConnect.querySelector('.btn-spinner');
  const text = btnConnect.querySelector('.btn-text');

  if (isLoading) {
    btnConnect.disabled = true;
    if (spinner) spinner.classList.remove('hidden');
    if (text) text.textContent = 'Bağlanılıyor...';
  } else {
    btnConnect.disabled = false;
    if (spinner) spinner.classList.add('hidden');
    if (text) text.textContent = 'Veritabanına Bağlan';
  }
}
