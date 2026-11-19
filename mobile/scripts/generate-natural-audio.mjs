// Records every preset phrase and common word once with Google's natural voices (Cloud Text-to-Speech)
// and bundles the audio in the app, so they sound natural on every phone, offline, with no setup.
//
// Needs a Google Cloud API key with the Text-to-Speech API enabled, in mobile/.env.local:
//   GOOGLE_TTS_API_KEY=your-key
// (not EXPO_PUBLIC_, so the key is never built into the app). Then, in mobile/:
//   node scripts/generate-natural-audio.mjs            # record what is missing
//   node scripts/generate-natural-audio.mjs --dry-run  # only count phrases and characters
//   node scripts/generate-natural-audio.mjs --force    # record everything again
//
// Writes assets/offline/speech/*.mp3 and offlineSpeech.ts (the lookup the app uses).
import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { mkdir, readdir, unlink, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const mobileDir = join(dirname(fileURLToPath(import.meta.url)), '..');
const audioDir = join(mobileDir, 'assets', 'offline', 'speech');
const manifestFile = join(mobileDir, 'offlineSpeech.ts');
const dryRun = process.argv.includes('--dry-run');
const force = process.argv.includes('--force');

// Calm and clear, a little slower than normal.
const speakingRate = 0.9;
const voiceLanguages = { en: 'en-US', fil: 'fil-PH' };
// Best voice families first.
const voiceFamilies = ['Chirp3-HD', 'Chirp-HD', 'Neural2', 'Wavenet', 'Standard'];

// Common words people tap or type on their own (English, Filipino).
const commonWords = [
  ['Yes', 'Oo'], ['No', 'Hindi'], ['Please', 'Pakiusap'], ['Thank you', 'Salamat'], ['Sorry', 'Pasensya na'],
  ['Help', 'Tulong'], ['Water', 'Tubig'], ['Food', 'Pagkain'], ['Toilet', 'Banyo'], ['Medicine', 'Gamot'],
  ['Pain', 'Masakit'], ['Stop', 'Tigil'], ['Wait', 'Sandali'], ['More', 'Pa'], ['Finished', 'Tapos na'],
  ['Hello', 'Kumusta'], ['Goodbye', 'Paalam'], ['Good morning', 'Magandang umaga'],
  ['Good afternoon', 'Magandang hapon'], ['Good evening', 'Magandang gabi'], ['Mother', 'Nanay'],
  ['Father', 'Tatay'], ['Teacher', 'Guro'], ['Friend', 'Kaibigan'], ['Home', 'Bahay'], ['School', 'Paaralan'],
  ['Hungry', 'Gutom'], ['Thirsty', 'Nauuhaw'], ['Tired', 'Pagod'], ['Sleepy', 'Inaantok'], ['Sick', 'May sakit'],
  ['Happy', 'Masaya'], ['Sad', 'Malungkot'], ['Angry', 'Galit'], ['Scared', 'Takot'], ['I love you', 'Mahal kita'],
  ['I want', 'Gusto ko'], ['I need', 'Kailangan ko'], ['I don\'t want', 'Ayoko'], ['Eat', 'Kumain'],
  ['Drink', 'Uminom'], ['Sleep', 'Matulog'], ['Play', 'Maglaro'], ['Go home', 'Uuwi na'],
];

// Must match normalizeSpeechKey() in speechText.ts.
function normalizeSpeechKey(text) {
  return text.toLocaleLowerCase().replace(/\s+/g, ' ').trim().replace(/[.!?]+$/, '');
}

function readApiKey() {
  if (process.env.GOOGLE_TTS_API_KEY) return process.env.GOOGLE_TTS_API_KEY.trim();
  const envFile = join(mobileDir, '.env.local');
  if (!existsSync(envFile)) return null;
  const match = readFileSync(envFile, 'utf8').match(/^\s*GOOGLE_TTS_API_KEY\s*=\s*"?([^"\r\n]+)"?/m);
  return match ? match[1].trim() : null;
}

function collectPhrases() {
  const content = JSON.parse(readFileSync(join(mobileDir, 'assets', 'offline', 'content.json'), 'utf8'));
  const phrases = new Map();
  const add = (language, text) => {
    if (!text?.trim()) return;
    const key = `${language}:${normalizeSpeechKey(text)}`;
    if (!phrases.has(key)) phrases.set(key, { language, text: text.trim(), key });
  };
  for (const language of Object.keys(voiceLanguages)) {
    for (const message of content.languages[language]?.messages ?? []) {
      add(language, message.message_text);
      add(language, message.title);
    }
  }
  for (const [english, filipino] of commonWords) {
    add('en', english);
    add('fil', filipino);
  }
  return [...phrases.values()];
}

async function google(path, apiKey, body) {
  const response = await fetch(`https://texttospeech.googleapis.com/v1/${path}${path.includes('?') ? '&' : '?'}key=${apiKey}`, {
    method: body ? 'POST' : 'GET',
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error?.message ?? `HTTP ${response.status}`);
  return result;
}

async function pickVoice(apiKey, languageCode) {
  const { voices = [] } = await google(`voices?languageCode=${languageCode}`, apiKey);
  for (const family of voiceFamilies) {
    const match = voices.find((voice) => voice.name.includes(`-${family}-`) && voice.ssmlGender === 'FEMALE')
      ?? voices.find((voice) => voice.name.includes(`-${family}-`));
    if (match) return match.name;
  }
  throw new Error(`No Google voice found for ${languageCode}`);
}

function fileNameFor(phrase, voiceName) {
  const hash = createHash('sha1').update(`${voiceName}|${speakingRate}|${phrase.text}`).digest('hex').slice(0, 16);
  return `${phrase.language}-${hash}.mp3`;
}

async function writeManifest(entries) {
  const lines = entries
    .sort((a, b) => a.key.localeCompare(b.key))
    .map((entry) => `  ${JSON.stringify(entry.key)}: require('./assets/offline/speech/${entry.fileName}'),`);
  await writeFile(manifestFile, [
    '// Generated by `node scripts/generate-natural-audio.mjs`. Do not edit by hand.',
    '// Maps "<language>:<normalized text>" (see normalizeSpeechKey in speechText.ts) to natural',
    '// recordings bundled in the app, so preset phrases sound natural on every phone, offline.',
    'export const offlineSpeech: Record<string, number> = {',
    ...lines,
    '};',
    '',
  ].join('\n'));
}

const phrases = collectPhrases();
const characters = phrases.reduce((total, phrase) => total + phrase.text.length, 0);
console.log(`${phrases.length} phrases, ${characters} characters (${phrases.filter((p) => p.language === 'en').length} English, ${phrases.filter((p) => p.language === 'fil').length} Filipino)`);
if (dryRun) process.exit(0);

const apiKey = readApiKey();
if (!apiKey) {
  console.error('Missing GOOGLE_TTS_API_KEY. Add it to mobile/.env.local (see the top of this script).');
  process.exit(1);
}

await mkdir(audioDir, { recursive: true });
const voiceNames = {};
for (const [language, languageCode] of Object.entries(voiceLanguages)) {
  voiceNames[language] = await pickVoice(apiKey, languageCode);
  console.log(`${language}: using ${voiceNames[language]}`);
}

const entries = [];
let recorded = 0;
let failed = 0;
for (const phrase of phrases) {
  const voiceName = voiceNames[phrase.language];
  const fileName = fileNameFor(phrase, voiceName);
  const filePath = join(audioDir, fileName);
  if (force || !existsSync(filePath)) {
    try {
      const result = await google('text:synthesize', apiKey, {
        input: { text: phrase.text },
        voice: { languageCode: voiceLanguages[phrase.language], name: voiceName },
        audioConfig: { audioEncoding: 'MP3', speakingRate, sampleRateHertz: 24000 },
      });
      await writeFile(filePath, Buffer.from(result.audioContent, 'base64'));
      recorded += 1;
    } catch (error) {
      failed += 1;
      console.warn(`  failed: ${phrase.key} (${error.message})`);
      continue;
    }
  }
  entries.push({ key: phrase.key, fileName });
}

// Remove recordings that are no longer used (old voices or removed phrases).
const used = new Set(entries.map((entry) => entry.fileName));
for (const file of await readdir(audioDir)) {
  if (file.endsWith('.mp3') && !used.has(file)) await unlink(join(audioDir, file));
}

await writeManifest(entries);
console.log(`Recorded ${recorded} new, ${entries.length} total in the app${failed ? `, ${failed} failed (run again to retry)` : ''}.`);
