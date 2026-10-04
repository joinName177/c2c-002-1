import type { Achievement, CycleStatus, Emotion, EmotionEntry, Goal, GoalCycle, GoalKind } from './models';
import { EMOTION_META } from './models';
import { diffKeys, forwardRun, shiftKey, todayKey } from './date';

const uid = (prefix: string) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

export function activeCycle(goal: Goal): GoalCycle | undefined {
  return goal.cycles.find((cycle) => cycle.status === '进行中');
}

export function goalTitle(goal: Goal): string {
  return goal.kind === 'daily' ? '每天记录一次' : `连续记录「${goal.emotion ?? ''}」`;
}

export function goalColor(goal: Goal): string {
  return goal.kind === 'emotion' && goal.emotion ? EMOTION_META[goal.emotion].color : '#5b8c66';
}

export function achievementVisual(achievement: Pick<Achievement, 'kind' | 'emotion'>): { symbol: string; color: string } {
  if (achievement.kind === 'emotion' && achievement.emotion) {
    return { symbol: EMOTION_META[achievement.emotion].symbol, color: EMOTION_META[achievement.emotion].color };
  }
  return { symbol: '❖', color: '#b08a4a' };
}

export function createGoal(kind: GoalKind, targetDays: number, startDate: string = todayKey(), emotion?: Emotion): Goal {
  return {
    id: uid('goal'),
    kind,
    emotion: kind === 'emotion' ? emotion : undefined,
    targetDays,
    createdAt: startDate,
    cycles: [{ id: uid('cycle'), startDate, targetDays, progressDays: 0, status: '进行中' }],
  };
}

/**
 * 重新开始：仅允许在没有进行中周期时调用。
 * 旧周期（含「已中断」与「已达成」）原样保留，新周期独立计数，不带上一轮进度。
 */
export function restartGoal(goal: Goal, startDate: string = todayKey()): Goal {
  return { ...goal, cycles: [...goal.cycles, { id: uid('cycle'), startDate, targetDays: goal.targetDays, progressDays: 0, status: '进行中' }] };
}

function achievementTitle(goal: Goal): string {
  return goal.kind === 'daily' ? `坚持 ${goal.targetDays} 天` : `${goal.emotion ?? ''} ${goal.targetDays} 天连击`;
}

function achievementDescription(goal: Goal): string {
  return goal.kind === 'daily'
    ? `连续 ${goal.targetDays} 天记录了自己的情绪`
    : `连续 ${goal.targetDays} 天与「${goal.emotion ?? ''}」好好相处`;
}

export interface GoalSyncResult { goals: Goal[]; achievements: Achievement[]; unlocked: Achievement[]; }

/**
 * 依据当前全部记录推进所有目标：
 * - 连续天数与植物同一套日期口径（forwardRun，整天未记录才算断，今天不计断）
 * - 达成本轮目标 → 轮次「已达成」并解锁一枚成就（幂等，不重复发）
 * - 宽限一天后仍断签 → 轮次冻结为「已中断」，保留截止时的进度，等待用户重新开始
 * - 重新开始产生的是新周期，累计只在新周期内进行
 */
export function syncGoals(entries: EmotionEntry[], goals: Goal[], previousAchievements: Achievement[] = [], nowKey: string = todayKey()): GoalSyncResult {
  const dailyDates = new Set(entries.map((item) => item.date));
  const achievements = [...previousAchievements];
  const unlocked: Achievement[] = [];

  const nextGoals = goals.map((goal) => {
    const hitDates = goal.kind === 'emotion'
      ? new Set(entries.filter((item) => item.emotion === goal.emotion).map((item) => item.date))
      : dailyDates;

    let changed = false;
    const cycles = goal.cycles.map((cycle) => {
      if (cycle.status !== '进行中') return cycle;

      const run = forwardRun(cycle.startDate, hitDates, nowKey);
      let status: CycleStatus = '进行中';
      let endDate: string | undefined;

      if (run >= cycle.targetDays) {
        status = '已达成';
        endDate = shiftKey(cycle.startDate, cycle.targetDays - 1);
      } else if (run > 0) {
        const lastRecorded = shiftKey(cycle.startDate, run - 1);
        // 最后一次命中距今超过一天（整天没记）即断签，冻结本轮
        if (diffKeys(lastRecorded, nowKey) > 1) {
          status = '已中断';
          endDate = shiftKey(lastRecorded, 1);
        }
      }

      if (status === cycle.status && run === cycle.progressDays) return cycle;
      changed = true;

      if (status === '已达成') {
        const exists = achievements.some((item) => item.goalId === goal.id && item.cycleId === cycle.id);
        if (!exists) {
          const achievement: Achievement = {
            id: uid('achievement'),
            goalId: goal.id,
            cycleId: cycle.id,
            kind: goal.kind,
            emotion: goal.emotion,
            title: achievementTitle(goal),
            description: achievementDescription(goal),
            date: endDate!,
            seen: false,
          };
          achievements.push(achievement);
          unlocked.push(achievement);
        }
      }

      return { ...cycle, progressDays: status === '已达成' ? cycle.targetDays : run, status, ...(endDate ? { endDate } : {}) };
    });

    return changed ? { ...goal, cycles } : goal;
  });

  return { goals: nextGoals, achievements, unlocked };
}
