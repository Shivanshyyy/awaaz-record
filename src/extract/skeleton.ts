// A rough "how it sounds" key for drug names. Speech recognition keeps the consonants of a long drug name
// far more often than its vowels, so two names are compared by their consonant skeletons.

export function skeleton(word: string): string {
  let s = word.toLowerCase().replace(/[^a-z]/g, '');
  s = s.replace(/ph/g, 'f').replace(/ck/g, 'k').replace(/qu/g, 'kw').replace(/x/g, 'ks');
  s = s.replace(/c(?=[eiy])/g, 's').replace(/c/g, 'k').replace(/q/g, 'k').replace(/z/g, 's');
  s = s.replace(/^[aeiouy]/, (v) => v); // a leading vowel is kept as a marker below
  const lead = /^[aeiou]/.test(s) ? s[0]! : '';
  s = lead + s.slice(lead.length).replace(/[aeiouyh]/g, '');
  return s.replace(/(.)\1+/g, '$1');
}

export function editDistance(a: string, b: string): number {
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let diagonal = row[0]!;
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const above = row[j]!;
      row[j] = Math.min(above + 1, row[j - 1]! + 1, diagonal + (a[i - 1] === b[j - 1] ? 0 : 1));
      diagonal = above;
    }
  }
  return row[b.length]!;
}
