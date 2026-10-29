// A plan to check a page is not a record that the page has been read.
export function appendReferenceMemo(previous, reference) {
  if (typeof previous !== 'string' || previous.length > 700 || !reference ||
      typeof reference.title !== 'string' || !reference.title.trim() ||
      !Array.isArray(reference.checkItems) || typeof reference.checkItems[0] !== 'string') {
    throw new Error('確認メモの形式を確認できませんでした。今のメモは残っています。');
  }
  let url;
  try { url = new URL(reference.url); } catch { throw new Error('参照先を確認できませんでした。'); }
  if (url.protocol !== 'https:' || url.username || url.password) throw new Error('参照先を確認できませんでした。');
  if (previous.includes(url.href)) return {note: previous, added: false};
  const plan = 'これから調べる：' + reference.title.trim() + '\n' + url.href +
    '\n確かめたいこと：' + reference.checkItems[0];
  const note = (previous ? previous + '\n\n' : '') + plan;
  if (note.length > 700) {
    throw new Error('確認メモは700文字までです。今のメモを整理してから追加してください。内容は消していません。');
  }
  return {note, added: true};
}
