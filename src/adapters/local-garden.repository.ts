import type { GardenRepository } from '../ports/garden-repository.port';
import type { GardenSnapshot } from '../core/models';
import { sampleSnapshot } from '../core/garden-engine';
const KEY = 'c2c-002-emotion-garden';
export class LocalGardenRepository implements GardenRepository {
  load(): GardenSnapshot {
    try {
      const value = localStorage.getItem(KEY);
      if (value) {
        const parsed = JSON.parse(value) as Partial<GardenSnapshot>;
        return { entries: parsed.entries ?? [], plants: parsed.plants ?? [], goals: parsed.goals ?? [], attempts: parsed.attempts ?? [], achievements: parsed.achievements ?? [] };
      }
    } catch { /* use seed */ }
    return sampleSnapshot();
  }
  save(snapshot: GardenSnapshot) { localStorage.setItem(KEY, JSON.stringify(snapshot)); }
}
