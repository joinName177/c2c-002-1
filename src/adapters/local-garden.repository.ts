import type { GardenRepository } from '../ports/garden-repository.port';
import type { Achievement, GardenSnapshot, Goal } from '../core/models';
import { sampleSnapshot } from '../core/garden-engine';
import { syncGoals } from '../core/goal-engine';
const KEY = 'c2c-002-emotion-garden';

function normalize(raw: Partial<GardenSnapshot>): GardenSnapshot {
  const goals: Goal[] = Array.isArray(raw.goals) ? raw.goals : [];
  const achievements: Achievement[] = Array.isArray(raw.achievements) ? raw.achievements : [];
  // 载入时按统一口径推进一次，覆盖跨天后首次打开的断签判断
  const synced = syncGoals(raw.entries ?? [], goals, achievements);
  return {
    entries: raw.entries ?? [],
    plants: raw.plants ?? [],
    goals: synced.goals,
    achievements: synced.achievements,
  };
}

export class LocalGardenRepository implements GardenRepository {
  load(): GardenSnapshot { try { const value = localStorage.getItem(KEY); if (value) return normalize(JSON.parse(value) as Partial<GardenSnapshot>); } catch { /* use seed */ } return sampleSnapshot(); }
  save(snapshot: GardenSnapshot) { localStorage.setItem(KEY, JSON.stringify(snapshot)); }
}
