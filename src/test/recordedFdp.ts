// Recorded home.fairdatapoint.org responses (resource definitions and the
// /spec of each type), served by a fake fetch for profile import tests.
import resourceDefinitions from '../core/__tests__/fixtures/home.fairdatapoint.org/resource-definitions.json?raw';
import specCatalog from '../core/__tests__/fixtures/home.fairdatapoint.org/spec-catalog.ttl?raw';
import specDataset from '../core/__tests__/fixtures/home.fairdatapoint.org/spec-dataset.ttl?raw';
import specDistribution from '../core/__tests__/fixtures/home.fairdatapoint.org/spec-distribution.ttl?raw';
import specFdp from '../core/__tests__/fixtures/home.fairdatapoint.org/spec-fdp.ttl?raw';

export function recordedFdpFetch(base = 'https://fdp.test') {
  const responses: Record<string, string> = {
    [`${base}/resource-definitions`]: resourceDefinitions,
    [`${base}/spec`]: specFdp,
    [`${base}/catalog/spec`]: specCatalog,
    [`${base}/dataset/spec`]: specDataset,
    [`${base}/distribution/spec`]: specDistribution,
  };
  return async (url: string) => {
    const body = responses[url];
    return { ok: body !== undefined, status: body === undefined ? 404 : 200, text: async () => body ?? '' };
  };
}
