import { createHash } from 'node:crypto';
import { md5Hex } from '../md5';

describe('md5Hex', () => {
  it('matches Node crypto, including multi-block and non-ASCII input', () => {
    const inputs = ['', 'a', 'https://purl.org/fair-metrics/FM_F1A', 'é ü 漢字', 'x'.repeat(55), 'x'.repeat(56), 'x'.repeat(64), 'y'.repeat(1000)];
    for (const s of inputs) expect(md5Hex(s)).toBe(createHash('md5').update(s, 'utf8').digest('hex'));
  });

  it('matches the metric node names on home.fairdatapoint.org', () => {
    // Root metadata recorded 2026-10-22 has these two metric nodes. The RI's
    // default metrics are FM_F1A and FM_A1.1 (Settings.DEFAULT_METRICS).
    const hashes = [md5Hex('https://purl.org/fair-metrics/FM_F1A'), md5Hex('https://purl.org/fair-metrics/FM_A1.1')];
    expect(hashes.sort()).toEqual(['445c0a70d1e214e545b261559e2842f4', '5d27e854a9e78eb3f663331cd47cdc13']);
  });
});
