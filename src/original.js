// The retained v1 bundle is an archive. Browser storage is never read or written.
// Its old storage calls are redirected to temporary in-memory objects before import.
function ephemeralStorage() {
  const entries = new Map();
  return {
    getItem: key => entries.get(String(key)) ?? null,
    setItem: (key, value) => entries.set(String(key), String(value)),
    removeItem: key => entries.delete(String(key)),
    clear: () => entries.clear(),
    key: index => [...entries.keys()][index] ?? null,
    get length() { return entries.size; }
  };
}
for (const name of ['localStorage', 'sessionStorage']) {
  Object.defineProperty(window, name, { value: ephemeralStorage(), configurable: true });
}
const archiveRoot = document.querySelector('#root');
const observer = new MutationObserver(() => {
  // No personal/free-text entry in the archived experience either.
  for (const field of archiveRoot.querySelectorAll('textarea, input:not([type=checkbox]):not([type=radio])')) {
    if (field.dataset.archived) continue;
    field.dataset.archived = 'true';
    field.disabled = true;
    field.hidden = true;
    const note = document.createElement('p');
    note.className = 'archive-field-note';
    note.textContent = '旧画面の記録として読むため、自由記述は入力せずにご覧ください。';
    field.after(note);
  }
});
observer.observe(archiveRoot, { childList: true, subtree: true });
await import('/assets/index-ty7p1djw.js');
