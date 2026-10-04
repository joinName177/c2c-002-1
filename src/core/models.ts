export type Emotion = '愤怒' | '平静' | '喜悦' | '忧伤' | '焦虑';
export type GrowthStage = '种子' | '发芽' | '开花' | '结果';
export type GoalType = 'daily' | 'emotion';
export type AttemptStatus = 'active' | 'completed' | 'interrupted';

export interface EmotionEntry { id: string; date: string; emotion: Emotion; note: string; intensity: number; }
export interface Plant { id: string; emotion: Emotion; plantedAt: string; lastWatered: string; streak: number; stage: GrowthStage; status: '繁茂' | '枯萎'; entryIds: string[]; }
export interface Goal { id: string; type: GoalType; emotion?: Emotion; targetDays: number; title: string; createdAt: string; }
export interface GoalAttempt { id: string; goalId: string; cycle: number; startDate: string; status: AttemptStatus; progressDays: number; endDate?: string; }
export interface Achievement { id: string; goalId: string; title: string; type: GoalType; emotion?: Emotion; cycle: number; targetDays: number; date: string; }
export interface GardenSnapshot { entries: EmotionEntry[]; plants: Plant[]; goals: Goal[]; attempts: GoalAttempt[]; achievements: Achievement[]; }

export const EMOTIONS: Emotion[] = ['愤怒', '平静', '喜悦', '忧伤', '焦虑'];
export const EMOTION_META: Record<Emotion, { plant: string; symbol: string; color: string; hint: string }> = {
  愤怒: { plant: '刺刺多肉', symbol: '♠', color: '#ef7c65', hint: '有刺，但也在保护你' },
  平静: { plant: '静谧绿萝', symbol: '⌁', color: '#5cbf9b', hint: '让呼吸慢下来' },
  喜悦: { plant: '小太阳', symbol: '✺', color: '#e8b84e', hint: '把好心情分享出去' },
  忧伤: { plant: '雾紫薰衣草', symbol: '✿', color: '#9c84c7', hint: '悲伤也有它的香气' },
  焦虑: { plant: '害羞含羞草', symbol: '❋', color: '#d991ae', hint: '温柔地靠近当下' },
};
