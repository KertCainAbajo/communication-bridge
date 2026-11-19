// Saves every category and message from the Laravel API into the app bundle,
// so the board works on a fresh install with no internet.
// Usage (backend running): node scripts/export-offline-content.mjs [apiBaseUrl]
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const apiBaseUrl = (process.argv[2] ?? process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:8000/api').replace(/\/$/, '');
const languageCodes = ['en', 'fil'];
const outputDirectory = join(dirname(fileURLToPath(import.meta.url)), '..', 'assets', 'offline');
const outputFile = join(outputDirectory, 'content.json');
const bisayaWordsFile = join(outputDirectory, 'bisaya-words.json');

async function getAllMessages(code) {
  const messages = [];
  for (let page = 1; ; page += 1) {
    const result = await getData(`/messages?language=${code}&per_page=100&page=${page}`);
    messages.push(...result.data);
    if (page >= (result.meta?.pagination?.last_page ?? 1)) break;
  }
  return messages;
}

async function getData(path) {
  const response = await fetch(`${apiBaseUrl}/v1${path}`, { headers: { Accept: 'application/json' } });
  const result = await response.json();
  if (!response.ok || !result.success) throw new Error(`${path}: ${result.message ?? response.status}`);
  return result;
}

const languages = {};
for (const code of languageCodes) {
  const categories = await getData(`/categories?language=${code}`);
  const messages = await getAllMessages(code);
  languages[code] = { categories: categories.data, messages };
  console.log(`${code}: ${categories.data.length} categories, ${messages.length} messages`);
}

await mkdir(outputDirectory, { recursive: true });
await writeFile(outputFile, `${JSON.stringify({ generated_at: new Date().toISOString(), languages }, null, 2)}\n`);
console.log(`Saved ${outputFile}`);

// Bisaya words help the app pick the Filipino voice (much clearer than English) for typed Bisaya.
try {
  const bisayaMessages = await getAllMessages('ceb');
  const words = new Set(bisayaMessages
    .flatMap((message) => `${message.title ?? ''} ${message.message_text ?? ''}`.toLocaleLowerCase().match(/[a-zñ'-]+/g) ?? []));
  await writeFile(bisayaWordsFile, `${JSON.stringify([...words].sort(), null, 2)}\n`);
  console.log(`Saved ${words.size} Bisaya words to ${bisayaWordsFile}`);
} catch (error) {
  console.log(`Bisaya words not updated (${error.message}); keeping the existing list.`);
}
