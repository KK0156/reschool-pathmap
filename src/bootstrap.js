// Keep a readable page when the application module graph cannot start. This
// loader does not send diagnostics, save input, or automatically reload a page.
const revision = 'reference-sites-01';
const root = document.getElementById('root');
const originalPanel = document.getElementById('app-startup');
const boundRetries = new WeakSet();
window.__rePathStartup = {state: 'loading', revision};

function showFailure(state, kind = '') {
  window.__rePathStartup = {state, revision, kind};
  let panel = document.getElementById('app-startup');
  if (!panel) {
    panel = originalPanel.cloneNode(true);
    // A partially rendered page may already contain a draft. Never replace it.
    root.prepend(panel);
  }
  panel.dataset.startupState = state;
  panel.querySelector('#app-startup-status').textContent = state === 'slow'
    ? '画面の読み込みに時間がかかっています。通信が完了すると表示されます。保存版も下から開けます。'
    : '画面に必要なファイルを読み込めませんでした。下のボタンで読み込みを試すか、保存版を開けます。';
  panel.querySelector('#app-startup-diagnostic').textContent =
    '表示版：' + revision + ' / 状態：' + state + (kind ? ' / 種別：' + kind : '');
  const retry = panel.querySelector('#app-startup-retry');
  retry.hidden = false;
  if (!boundRetries.has(retry)) {
    boundRetries.add(retry);
    retry.addEventListener('click', () => {
      const hasDraft = [...root.querySelectorAll('textarea, input:not([type=checkbox]):not([type=radio]):not([type=file])')]
        .some(field => field.value.trim());
      if (hasDraft && !confirm('読み込み直すと、画面内の入力は消えます。読み込み直しますか？')) return;
      const next = new URL(location.href);
      next.searchParams.set('startupRetry', String(Date.now()));
      location.replace(next.href);
    });
  }
}

const timer = setTimeout(() => showFailure('slow'), 12000);
const application = new URL('./desk-app.js', import.meta.url);
application.searchParams.set('v', revision);
const retry = new URL(location.href).searchParams.get('startupRetry');
if (retry && /^\d{1,16}$/.test(retry)) application.searchParams.set('retry', retry);
async function startApplication() {
  try {
    await import(application.href);
    if (!root.querySelector('.research-desk')) throw new Error('ApplicationNotRendered');
    // Preserve an early skip-link request when the loading panel is replaced.
    if (location.hash === '#main') document.getElementById('main')?.focus({preventScroll: true});
    window.__rePathStartup = {state: 'ready', revision};
  } catch (error) {
    // Only a bounded error category is shown, never a memo, stack trace or URL.
    const kind = ['TypeError', 'SyntaxError', 'ReferenceError'].includes(error?.name) ? error.name : '起動エラー';
    showFailure('error', kind);
  } finally {
    clearTimeout(timer);
  }
}
// Do not require top-level await in the small startup module itself.
startApplication();
