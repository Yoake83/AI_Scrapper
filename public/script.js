const form = document.querySelector('#summary-form');
const input = document.querySelector('#url');
const submit = document.querySelector('#submit-button');
const buttonLabel = document.querySelector('#button-label');
const errorBox = document.querySelector('#error');
const empty = document.querySelector('#empty-state');
const loading = document.querySelector('#loading-state');
const result = document.querySelector('#summary-state');
const panel = document.querySelector('#result-panel');
const tag = document.querySelector('#result-tag');
const copy = document.querySelector('#copy-button');
let currentSummary = '';
let copyTimer;

form.addEventListener('submit', async event => {
  event.preventDefault();
  if (!form.reportValidity() || submit.disabled) return;
  errorBox.hidden = true;
  empty.hidden = true;
  result.hidden = true;
  loading.hidden = false;
  panel.setAttribute('aria-busy', 'true');
  submit.disabled = true;
  buttonLabel.textContent = 'Summarizing…';
  tag.textContent = 'A LITTLE MAGIC IN PROGRESS';
  try {
    const response = await fetch('/api/summarize', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: input.value.trim() }), signal: AbortSignal.timeout(55000),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Something went wrong. Please try again.');
    currentSummary = data.summary;
    document.querySelector('#page-title').textContent = data.title;
    document.querySelector('#summary').textContent = data.summary;
    const source = document.querySelector('#source-link');
    source.href = data.url;
    source.textContent = `${new URL(data.url).hostname} · View source`;
    document.querySelector('#source-meta').textContent = `${data.wordCount.toLocaleString()} source words${data.truncated ? ' · excerpt summarized' : ''} · distilled with Groq`;
    clearTimeout(copyTimer);
    copy.textContent = 'Copy summary';
    result.hidden = false;
    tag.textContent = 'FRESHLY PICKED';
  } catch (error) {
    errorBox.textContent = error.name === 'TimeoutError' ? 'That took too long. Please try another page.' : error.message;
    errorBox.hidden = false;
    empty.hidden = false;
    tag.textContent = 'READY FOR ANOTHER PICK';
  } finally {
    loading.hidden = true;
    panel.setAttribute('aria-busy', 'false');
    submit.disabled = false;
    buttonLabel.textContent = 'Summarize';
  }
});
copy.addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(currentSummary);
    copy.textContent = 'Copied!';
  } catch { copy.textContent = 'Select the text to copy'; }
  clearTimeout(copyTimer);
  copyTimer = setTimeout(() => { copy.textContent = 'Copy summary'; }, 2500);
});
