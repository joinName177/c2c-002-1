import type { Emotion, EmotionEntry, GardenSnapshot, GrowthStage, Plant, Goal, Achievement } from './models';
import { EMOTION_META, EMOTIONS } from './models';
import { shiftKey, todayKey } from './date';
import { createGoal, restartGoal, syncGoals } from './goal-engine';

export function stageFor(streak: number): GrowthStage { if (streak >= 14) return '结果'; if (streak >= 7) return '开花'; if (streak >= 3) return '发芽'; return '种子'; }

/**
 * 截至今天的连续记录天数：从今天向前逐日命中。
 * 今天还没记录时允许一天宽限（从昨天向前数），与目标断签判断同口径。
 */
export function streakFor(entries: EmotionEntry[], emotion: Emotion, nowKey: string = todayKey()): number {
  const dates = new Set(entries.filter((item) => item.emotion === emotion).map((item) => item.date));
  const start = dates.has(nowKey) ? nowKey : shiftKey(nowKey, -1);
  let streak = 0;
  let cursor = start;
  while (dates.has(cursor)) { streak += 1; cursor = shiftKey(cursor, -1); }
  return streak;
}

export function syncPlants(entries: EmotionEntry[], previous: Plant[] = []): Plant[] {
  return EMOTIONS.filter((emotion) => entries.some((item) => item.emotion === emotion)).map((emotion) => {
    const own = entries.filter((item) => item.emotion === emotion).sort((a, b) => a.date.localeCompare(b.date));
    const existing = previous.find((item) => item.emotion === emotion);
    const streak = streakFor(entries, emotion);
    return { id: existing?.id ?? `plant-${emotion}`, emotion, plantedAt: own[0].date, lastWatered: own[own.length - 1].date, streak, stage: stageFor(streak), status: streak ? '繁茂' : '枯萎', entryIds: own.map((item) => item.id) };
  });
}

export function createEntry(emotion: Emotion, note: string, intensity: number, date: string = todayKey()): EmotionEntry { return { id: `emotion-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, date, emotion, note: note.trim() || EMOTION_META[emotion].hint, intensity: Math.min(5, Math.max(1, Number(intensity) || 3)) }; }
export function annualReport(entries: EmotionEntry[]) {
  const counts = EMOTIONS.map((emotion) => ({ emotion, count: entries.filter((item) => item.emotion === emotion).length })).sort((a, b) => b.count - a.count);
  const active = new Set(entries.map((item) => item.date)).size;
  const intensity = entries.length ? entries.reduce((sum, item) => sum + item.intensity, 0) / entries.length : 0;
  return { top: counts[0], counts, active, lushness: Math.min(100, Math.round((active / 90) * 70 + (intensity / 5) * 30)), intensity: Math.round(intensity * 10) / 10 };
}

export function sampleSnapshot(): GardenSnapshot {
  const today = todayKey();
  const entries: EmotionEntry[] = [];
  const seed: Emotion[] = ['喜悦', '喜悦', '平静', '平静', '平静', '平静', '喜悦', '忧伤', '焦虑', '平静', '喜悦'];
  seed.forEach((emotion, index) => { const date = shiftKey(today, -(seed.length - index - 1)); entries.push(createEntry(emotion, index % 2 ? '今天注意到了自己的节奏。' : '给这一天留下一颗种子。', (index % 5) + 1, date)); });

  // 示例目标 1：每天记录一次 ×7，前 10 天达成一轮，新周期 4/7 进行中
  let daily: Goal = createGoal('daily', 7, shiftKey(today, -10));
  daily = { ...daily, cycles: [{ ...daily.cycles[0], id: 'cycle-daily-1' }] };
  daily = restartGoal(daily, shiftKey(today, -3));
  daily = { ...daily, cycles: daily.cycles.map((cycle) => (cycle.status === '进行中' ? { ...cycle, id: 'cycle-daily-2' } : cycle)) };

  // 示例目标 2：连续记录「平静」×7，一轮中断在 4/7
  let calm: Goal = createGoal('emotion', 7, shiftKey(today, -7), '平静');
  calm = { ...calm, cycles: [{ ...calm.cycles[0], id: 'cycle-calm-1' }] };

  let goals = [daily, calm];
  let achievements: Achievement[] = [];
  ({ goals, achievements } = syncGoals(entries, goals, achievements));
  // 演示数据里的成就视为已经看过，不再弹窗
  achievements = achievements.map((item) => ({ ...item, seen: true }));

  return { entries, plants: syncPlants(entries), goals, achievements };
}
