export type Emotion = '愤怒' | '平静' | '喜悦' | '忧伤' | '焦虑';
export type GrowthStage = '种子' | '发芽' | '开花' | '结果';

export interface EmotionEntry { id: string; date: string; emotion: Emotion; note: string; intensity: number; }
export interface Plant { id: string; emotion: Emotion; plantedAt: string; lastWatered: string; streak: number; stage: GrowthStage; status: '繁茂' | '枯萎'; entryIds: string[]; }

/** 目标类型：每天记录一次任意情绪，或连续记录某一类情绪 */
export type GoalKind = 'daily' | 'emotion';
/** 一轮目标周期的状态；断签的轮次永久保留为「已中断」，不做静默归零 */
export type CycleStatus = '进行中' | '已达成' | '已中断';

export interface GoalCycle {
  id: string;
  /** 本轮第一天，连续天数只从这一天起算 */
  startDate: string;
  /** 本轮设定的目标天数（建轮时快照，改目标不影响旧轮） */
  targetDays: number;
  /** 本轮已连续累计的天数，按统一日期口径计算 */
  progressDays: number;
  status: CycleStatus;
  /** 达成日 / 断签日 */
  endDate?: string;
}

export interface Goal {
  id: string;
  kind: GoalKind;
  /** kind 为 emotion 时指定情绪类别 */
  emotion?: Emotion;
  targetDays: number;
  createdAt: string;
  /** 历轮周期按时间排列；重新开始只追加新一轮，旧轮（含已中断）保留 */
  cycles: GoalCycle[];
}

export interface Achievement {
  id: string;
  goalId: string;
  cycleId: string;
  kind: GoalKind;
  emotion?: Emotion;
  title: string;
  description: string;
  /** 解锁当天（= 目标达成日） */
  date: string;
  /** 是否已在弹窗中查看过 */
  seen: boolean;
}

export interface GardenSnapshot { entries: EmotionEntry[]; plants: Plant[]; goals: Goal[]; achievements: Achievement[]; }

export const EMOTIONS: Emotion[] = ['愤怒', '平静', '喜悦', '忧伤', '焦虑'];
export const EMOTION_META: Record<Emotion, { plant: string; symbol: string; color: string; hint: string }> = {
  愤怒: { plant: '刺刺多肉', symbol: '♠', color: '#ef7c65', hint: '有刺，但也在保护你' },
  平静: { plant: '静谧绿萝', symbol: '⌁', color: '#5cbf9b', hint: '让呼吸慢下来' },
  喜悦: { plant: '小太阳', symbol: '✺', color: '#e8b84e', hint: '把好心情分享出去' },
  忧伤: { plant: '雾紫薰衣草', symbol: '✿', color: '#9c84c7', hint: '悲伤也有它的香气' },
  焦虑: { plant: '害羞含羞草', symbol: '❋', color: '#d991ae', hint: '温柔地靠近当下' },
};
