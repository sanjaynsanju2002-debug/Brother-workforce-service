/* Shared by the website and the installable app landing page. No dependencies. */
(() => {
  const text = value => window.bwsLanguage?.text(value) ?? value;
  let installPrompt = null;
  const standalone = window.matchMedia('(display-mode: standalone)');
  const installed = () => standalone.matches || window.navigator.standalone === true;
  const update = () => {
    const button = document.querySelector('[data-install-button]');
    const help = document.querySelector('[data-install-help]');
    if (!button || !help) return;
    button.hidden = installed();
    if (installed()) {
      help.textContent = text('You are using the Brothers app. Choose an option below to get started.');
    } else if (installPrompt) {
      button.textContent = text('Install app');
      help.textContent = text('Add Brothers to your home screen for quick access.');
    } else {
      button.textContent = text('How to install');
      help.textContent = text('On Android, open this page in Chrome, then use its menu to select “Install app” or “Add to Home screen”.');
    }
  };
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    installPrompt = event;
    update();
  });
  window.addEventListener('appinstalled', () => {
    installPrompt = null;
    update();
    const help = document.querySelector('[data-install-help]');
    if (help) help.textContent = text('Installed! Open Brothers from your home screen.');
    const button = document.querySelector('[data-install-button]');
    if (button) button.hidden = true;
  });
  standalone.addEventListener('change', update);
  window.addEventListener('bws-language-change', update);
  document.querySelector('[data-install-button]')?.addEventListener('click', async () => {
    if (!installPrompt) {
      const help = document.querySelector('[data-install-help]');
      if (help) {
        help.textContent = /iPad|iPhone|iPod/.test(navigator.userAgent)
          ? text('In Safari, tap Share, then “Add to Home Screen”.')
          : text('Open this page in Chrome on Android. Tap the three-dot menu, then “Install app” or “Add to Home screen”. If you are inside WhatsApp or another app, choose “Open in browser” first.');
        help.focus();
      }
      return;
    }
    const prompt = installPrompt;
    installPrompt = null;
    try {
      await prompt.prompt();
      await prompt.userChoice;
    } catch {
      // Browser installation remains available through its own menu.
    }
    update();
  });
  const updateConnection = () => {
    const notice = document.querySelector('[data-offline-notice]');
    if (notice) notice.hidden = navigator.onLine;
  };
  window.addEventListener('online', updateConnection);
  window.addEventListener('offline', updateConnection);
  updateConnection();
  update();
  if ('serviceWorker' in navigator && window.isSecureContext) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' }).catch(() => {
        // Registration must never stop ordinary website use.
      });
    });
  }
})();
