// Fingerspelling: shows any word as hand signs, letter by letter, so every card (including words people
// add later) gets a sign automatically. The manual alphabet is shared by American Sign Language (ASL)
// and Filipino Sign Language (FSL); FSL's extra letters Ñ and NG are shown with the hands for N and N+G.
// Hand drawings: "Sign language A-Z" on Wikimedia Commons, public domain.
import { memo } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';

const signImages: Record<string, number> = {
  a: require('./assets/signs/a.png'), b: require('./assets/signs/b.png'), c: require('./assets/signs/c.png'),
  d: require('./assets/signs/d.png'), e: require('./assets/signs/e.png'), f: require('./assets/signs/f.png'),
  g: require('./assets/signs/g.png'), h: require('./assets/signs/h.png'), i: require('./assets/signs/i.png'),
  j: require('./assets/signs/j.png'), k: require('./assets/signs/k.png'), l: require('./assets/signs/l.png'),
  m: require('./assets/signs/m.png'), n: require('./assets/signs/n.png'), o: require('./assets/signs/o.png'),
  p: require('./assets/signs/p.png'), q: require('./assets/signs/q.png'), r: require('./assets/signs/r.png'),
  s: require('./assets/signs/s.png'), t: require('./assets/signs/t.png'), u: require('./assets/signs/u.png'),
  v: require('./assets/signs/v.png'), w: require('./assets/signs/w.png'), x: require('./assets/signs/x.png'),
  y: require('./assets/signs/y.png'), z: require('./assets/signs/z.png'),
};

type SignLetter = { label: string; image: number };

// Splits text into hand-sign letters; words are kept apart so the spelling is easy to follow.
export function fingerspell(text: string): SignLetter[][] {
  return text
    .toLocaleLowerCase()
    .split(/\s+/)
    .map((word) => [...word]
      .map((character) => (character === 'ñ' ? { label: 'Ñ', image: signImages.n } : null)
        ?? (signImages[character] ? { label: character.toUpperCase(), image: signImages[character] } : null))
      .filter((letter): letter is SignLetter => letter !== null))
    .filter((word) => word.length > 0);
}

// Splits a word into lines of at most `maxPerLine` letters, as even as possible
// (HELP → HE/LP, UNDERSTAND → UNDE/RST/AND) so no letter is left alone on a line.
export function evenLines<T>(letters: T[], maxPerLine: number): T[][] {
  const lineCount = Math.max(1, Math.ceil(letters.length / Math.max(1, maxPerLine)));
  const lines: T[][] = [];
  let start = 0;
  for (let line = 0; line < lineCount; line += 1) {
    const length = Math.ceil((letters.length - start) / (lineCount - line));
    lines.push(letters.slice(start, start + length));
    start += length;
  }
  return lines;
}

// Memoised: the hand signs only redraw when the word changes.
export const SignWord = memo(function SignWord({ text, size = 26, maxPerLine = 99, oneLine = false }: { text: string; size?: number; maxPerLine?: number; oneLine?: boolean }) {
  const words = fingerspell(text);
  if (words.length === 0) return null;
  const spelled = words.map((word) => word.map((letter) => letter.label).join(' ')).join(', ');

  return (
    <View accessible accessibilityLabel={`Sign language fingerspelling: ${spelled}`} style={oneLine ? styles.wordsOneLine : styles.words}>
      {words.map((word, wordIndex) => {
        const lines = evenLines(word, maxPerLine);
        // A word split over several lines takes whole rows, so the next word starts below it
        // (side by side, "TEAC/HER" next to "I" read as "TEACI").
        return (
        <View key={wordIndex} style={[styles.word, lines.length > 1 && !oneLine && styles.wordOwnRows]}>
          {lines.map((line, lineIndex) => (
            <View key={lineIndex} style={styles.line}>
              {line.map((letter, letterIndex) => (
                <View key={letterIndex} style={styles.letter}>
                  <Image source={letter.image} style={{ width: size, height: size }} resizeMode="contain" />
                  <Text style={[styles.label, { fontSize: Math.max(8, Math.round(size * 0.36)) }]}>{letter.label}</Text>
                </View>
              ))}
            </View>
          ))}
        </View>
        );
      })}
    </View>
  );
});

const styles = StyleSheet.create({
  words: { width: '100%', flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', columnGap: 14, rowGap: 8 },
  // Long words continue on the next line (split evenly) instead of running past the card.
  word: { maxWidth: '100%', alignItems: 'center', gap: 4 },
  wordOwnRows: { width: '100%' },
  // All words in one row (scrolls sideways), used while typing.
  wordsOneLine: { flexDirection: 'row', alignItems: 'flex-start', columnGap: 14 },
  line: { flexDirection: 'row', gap: 2 },
  letter: { alignItems: 'center' },
  label: { color: '#475569', fontSize: 10, fontWeight: '800', marginTop: 1 },
});
