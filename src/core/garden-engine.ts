import type { Achievement, Emotion, EmotionEntry, GardenSnapshot, Goal, GoalAttempt, GoalType, GrowthStage, Plant } from './models';
import { EMOTION_META, EMOTIONS } from './models';

const day = 86400000;

/** 全站统一的日期口径：与 createEntry 一样使用 UTC 日期字符串 */
export function todayStr(): string { return new Date().toISOString().slice(0, 10); }
export function shiftDate(date: string, offset: number): string { return new Date(new Date(`${date}T00:00:00Z`).getTime() + offset * day).toISOString().slice(0, 10); }
export function daysBetween(from: string, to: string): number { return Math.round((new Date(`${to}T00:00:00Z`).getTime() - new Date(`${from}T00:00:00Z`).getTime()) / day); }

/** 全站统一的“某天算不算数”口径：当天有任意一条（指定情绪的）记录即算数 */
export function entryDates(entries: EmotionEntry[], emotion?: Emotion): Set<string> {
  return new Set(entries.filter((item) => !emotion || item.emotion === emotion).map((item) => item.date));
}

export function stageFor(streak: number): GrowthStage { if (streak >= 14) return '结果'; if (streak >= 7) return '开花'; if (streak >= 3) return '发芽'; return '种子'; }
export function streakFor(entries: EmotionEntry[], emotion: Emotion): number {
  const dates = entryDates(entries, emotion);
  let streak = 0; let cursor = todayStr();
  while (dates.has(cursor)) { streak += 1; cursor = shiftDate(cursor, -1); }
  if (!streak) {
    const sortedDates = [...dates].sort(); const latest = sortedDates[sortedDates.length - 1]; if (!latest) return 0;
    if (daysBetween(latest, todayStr()) > 1) return 0;
    streak = 1;
  }
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
export function createEntry(emotion: Emotion, note: string, intensity: number, date = todayStr()): EmotionEntry { return { id: `emotion-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, date, emotion, note: note.trim() || EMOTION_META[emotion].hint, intensity: Math.min(5, Math.max(1, Number(intensity) || 3)) }; }
export function annualReport(entries: EmotionEntry[]) {
  const counts = EMOTIONS.map((emotion) => ({ emotion, count: entries.filter((item) => item.emotion === emotion).length })).sort((a, b) => b.count - a.count);
  const active = new Set(entries.map((item) => item.date)).size;
  const intensity = entries.length ? entries.reduce((sum, item) => sum + item.intensity, 0) / entries.length : 0;
  return { top: counts[0], counts, active, lushness: Math.min(100, Math.round((active / 90) * 70 + (intensity / 5) * 30)), intensity: Math.round(intensity * 10) / 10 };
}

let uid = 0;
function uniqueId(prefix: string): string { uid += 1; return `${prefix}-${Date.now()}-${uid}-${Math.random().toString(36).slice(2, 7)}`; }

export function createGoal(type: GoalType, targetDays: number, emotion: Emotion = '喜悦', title = ''): { goal: Goal; attempt: GoalAttempt } {
  const days = Math.min(365, Math.max(1, Math.round(Number(targetDays)) || 7));
  const id = uniqueId('goal');
  const name = title.trim() || (type === 'daily' ? `每天记录一次 · 连续 ${days} 天` : `连续 ${days} 天记录「${emotion}」`);
  const goal: Goal = { id, type, emotion: type === 'emotion' ? emotion : undefined, targetDays: days, title: name, createdAt: todayStr() };
  return { goal, attempt: { id: uniqueId('attempt'), goalId: id, cycle: 1, startDate: todayStr(), status: 'active', progressDays: 0 } };
}
export function restartAttempt(goalId: string, attempts: GoalAttempt[]): GoalAttempt {
  const cycle = attempts.filter((item) => item.goalId === goalId).reduce((max, item) => Math.max(max, item.cycle), 0) + 1;
  return { id: uniqueId('attempt'), goalId, cycle, startDate: todayStr(), status: 'active', progressDays: 0 };
}

export interface AttemptEvaluation { status: 'active' | 'completed' | 'interrupted'; progress: number; endDate?: string; }
/**
 * 一轮挑战的结算口径：从 startDate 起逐日检查，只累计本轮的天数。
 * 昨天及以前缺记录 → 已中断（endDate 为断签日，progress 为断签前坚持的天数，冻结保留）；
 * 累计达到目标天数 → 已完成（endDate 为达成当天）；今天还没记录不算断签。
 */
export function evaluateAttempt(goal: Goal, attempt: GoalAttempt, dates: Set<string>, today = todayStr()): AttemptEvaluation {
  const span = Math.max(0, daysBetween(attempt.startDate, today));
  let progress = 0;
  for (let offset = 0; offset <= span; offset += 1) {
    const date = shiftDate(attempt.startDate, offset);
    if (dates.has(date)) {
      progress += 1;
      if (progress >= goal.targetDays) return { status: 'completed', progress, endDate: date };
    } else if (date !== today) {
      return { status: 'interrupted', progress, endDate: date };
    }
  }
  return { status: 'active', progress };
}
export function syncGoals(entries: EmotionEntry[], goals: Goal[], attempts: GoalAttempt[], achievements: Achievement[]): { attempts: GoalAttempt[]; achievements: Achievement[]; unlocked: Achievement[] } {
  const unlocked: Achievement[] = [];
  const nextAttempts = attempts.map((attempt) => {
    if (attempt.status !== 'active') return attempt;
    const goal = goals.find((item) => item.id === attempt.goalId);
    if (!goal) return attempt;
    const dates = entryDates(entries, goal.type === 'emotion' ? goal.emotion : undefined);
    const result = evaluateAttempt(goal, attempt, dates);
    if (result.status === 'completed') {
      unlocked.push({ id: `achievement-${attempt.id}`, goalId: goal.id, title: goal.title, type: goal.type, emotion: goal.emotion, cycle: attempt.cycle, targetDays: goal.targetDays, date: result.endDate ?? todayStr() });
    }
    return { ...attempt, status: result.status, progressDays: result.progress, endDate: result.endDate };
  });
  return { attempts: nextAttempts, achievements: [...achievements, ...unlocked], unlocked };
}

export function sampleSnapshot(): GardenSnapshot {
  const entries: EmotionEntry[] = [];
  const seed: Emotion[] = ['喜悦', '喜悦', '平静', '平静', '平静', '平静', '喜悦', '忧伤', '焦虑', '平静', '喜悦'];
  seed.forEach((emotion, index) => { const date = shiftDate(todayStr(), -(seed.length - index - 1)); entries.push(createEntry(emotion, index % 2 ? '今天注意到了自己的节奏。' : '给这一天留下一颗种子。', (index % 5) + 1, date)); });
  const goals: Goal[] = [
    { id: 'goal-sample-daily', type: 'daily', targetDays: 7, title: '每天记录一次 · 连续 7 天', createdAt: shiftDate(todayStr(), -4) },
    { id: 'goal-sample-calm', type: 'emotion', emotion: '平静', targetDays: 7, title: '连续 7 天记录「平静」', createdAt: shiftDate(todayStr(), -8) },
  ];
  const attempts: GoalAttempt[] = [
    { id: 'attempt-sample-daily-1', goalId: 'goal-sample-daily', cycle: 1, startDate: shiftDate(todayStr(), -4), status: 'active', progressDays: 0 },
    { id: 'attempt-sample-calm-1', goalId: 'goal-sample-calm', cycle: 1, startDate: shiftDate(todayStr(), -8), status: 'active', progressDays: 0 },
    { id: 'attempt-sample-calm-2', goalId: 'goal-sample-calm', cycle: 2, startDate: shiftDate(todayStr(), -1), status: 'active', progressDays: 0 },
  ];
  const synced = syncGoals(entries, goals, attempts, []);
  return { entries, plants: syncPlants(entries), goals, attempts: synced.attempts, achievements: synced.achievements };
}
