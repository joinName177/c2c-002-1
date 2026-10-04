<script setup lang="ts">
import { computed, reactive, ref } from 'vue';
import { LocalGardenRepository } from '../adapters/local-garden.repository';
import { EMOTION_META, EMOTIONS, type Emotion, type GardenSnapshot, type Goal, type GoalCycle } from '../core/models';
import { annualReport, createEntry, sampleSnapshot, syncPlants } from '../core/garden-engine';
import { activeCycle, achievementVisual, createGoal, restartGoal, syncGoals } from '../core/goal-engine';
import { todayKey } from '../core/date';

const TABS = ['花园', '种植', '时间轴', '标本馆', '成就', '年报'] as const;
type TabName = (typeof TABS)[number];

const repo = new LocalGardenRepository();
const state = reactive(repo.load());
const tab = ref<TabName>('花园');
const selectedEmotion = ref<Emotion>('喜悦');
const notice = ref('');
const draft = reactive({ note: '', intensity: 3 });
const today = todayKey();

state.plants = syncPlants(state.entries, state.plants);
// 跨天首次打开时可能有尚未查看的成就（load 时已按统一口径结算），进入弹窗队列
const achievementQueue = ref(state.achievements.filter((item) => !item.seen));
repo.save(snapshotOf());

const report = computed(() => annualReport(state.entries));
const living = computed(() => state.plants.filter((plant) => plant.status === '繁茂'));
const specimens = computed(() => state.plants.filter((plant) => plant.status === '枯萎'));
const timeline = computed(() => [...state.entries].sort((a, b) => b.date.localeCompare(a.date)));
const achievementsList = computed(() => [...state.achievements].sort((a, b) => b.date.localeCompare(a.date)));
const currentAchievement = computed(() => achievementQueue.value[0]);
const recordedToday = computed(() => new Set(state.entries.map((item) => item.date)).has(today));
const emotionToday = (emotion?: Emotion) => state.entries.some((item) => item.date === today && item.emotion === emotion);

function snapshotOf(): GardenSnapshot {
  return { entries: state.entries, plants: state.plants, goals: state.goals, achievements: state.achievements };
}

/** 植物与目标共用一次结算，日期/连续口径完全一致 */
function persist() {
  state.plants = syncPlants(state.entries, state.plants);
  const synced = syncGoals(state.entries, state.goals, state.achievements);
  state.goals = synced.goals;
  state.achievements = synced.achievements;
  repo.save(snapshotOf());
  achievementQueue.value.push(...synced.unlocked);
}

function plant() {
  state.entries.unshift(createEntry(selectedEmotion.value, draft.note, draft.intensity));
  draft.note = '';
  persist();
  notice.value = `${EMOTION_META[selectedEmotion.value].plant} 已经种下`;
  tab.value = '花园';
}

function reset() {
  const fresh = sampleSnapshot();
  state.entries = fresh.entries;
  state.plants = fresh.plants;
  state.goals = fresh.goals;
  state.achievements = fresh.achievements;
  achievementQueue.value = [];
  repo.save(snapshotOf());
  notice.value = '已恢复初始示例花园';
}

function dismissAchievement() {
  const item = achievementQueue.value.shift();
  if (item) {
    const stored = state.achievements.find((entry) => entry.id === item.id);
    if (stored) stored.seen = true;
    repo.save(snapshotOf());
  }
}

/* ---------- 目标 ---------- */

const goalFormOpen = ref(false);
const goalError = ref('');
const goalDraft = reactive<{ kind: 'daily' | 'emotion'; emotion: Emotion; targetDays: number }>({ kind: 'daily', emotion: '喜悦', targetDays: 7 });
const targetPresets = [3, 7, 14, 30];

function openGoalForm() {
  goalFormOpen.value = true;
  goalError.value = '';
}

function submitGoal() {
  const target = Math.floor(Number(goalDraft.targetDays));
  if (!target || target < 1 || target > 365) { goalError.value = '目标天数需要在 1–365 之间'; return; }
  if (goalDraft.kind === 'emotion' && !goalDraft.emotion) { goalError.value = '请选择一种情绪类别'; return; }
  const duplicated = state.goals.some((goal) =>
    goal.kind === goalDraft.kind
    && (goal.kind === 'daily' || goal.emotion === goalDraft.emotion)
    && activeCycle(goal));
  if (duplicated) { goalError.value = '同类目标已有一轮正在进行，等它达成或重新开始后再建吧'; return; }
  state.goals.push(createGoal(goalDraft.kind, target, today, goalDraft.kind === 'emotion' ? goalDraft.emotion : undefined));
  goalFormOpen.value = false;
  persist();
}

function restart(goal: Goal) {
  const index = state.goals.findIndex((item) => item.id === goal.id);
  if (index >= 0 && !activeCycle(state.goals[index])) {
    state.goals[index] = restartGoal(state.goals[index], today);
    persist();
  }
}

function removeGoal(goal: Goal) {
  if (window.confirm(`放弃「${goalTitle(goal)}」目标？已获得的成就仍会保留在成就册中。`)) {
    state.goals = state.goals.filter((item) => item.id !== goal.id);
    persist();
  }
}

function goalTitle(goal: Goal): string {
  return goal.kind === 'daily' ? '每天记录一次' : `连续记录「${goal.emotion ?? ''}」`;
}

function goalSymbol(goal: Goal): string {
  return goal.kind === 'emotion' && goal.emotion ? EMOTION_META[goal.emotion].symbol : '❖';
}

function goalColorOf(goal: Goal): string {
  return goal.kind === 'emotion' && goal.emotion ? EMOTION_META[goal.emotion].color : '#5b8c66';
}

function shownCycle(goal: Goal): GoalCycle | undefined {
  return activeCycle(goal) ?? goal.cycles[goal.cycles.length - 1];
}

function pastCycles(goal: Goal): GoalCycle[] {
  return goal.cycles.filter((cycle) => cycle.status !== '进行中');
}

function goalPercent(goal: Goal): number {
  const cycle = shownCycle(goal);
  if (!cycle) return 0;
  const ratio = Math.min(1, cycle.progressDays / cycle.targetDays);
  return Math.round(ratio * 100);
}

function goalFoot(goal: Goal): string {
  const cycle = activeCycle(goal);
  if (!cycle) return '本轮已结束，随时可以重新开始';
  const doneToday = goal.kind === 'daily' ? recordedToday.value : emotionToday(goal.emotion);
  if (doneToday) return `今天已记录 · 已连续 ${cycle.progressDays} 天`;
  return `今天还没记录 · 再坚持 ${Math.max(0, cycle.targetDays - cycle.progressDays)} 天达成`;
}
</script>

<template>
  <div class="garden-app">
    <header class="garden-topbar"><div class="garden-brand"><span class="garden-mark">✿</span><div><span class="eyebrow">THE INNER GARDEN / 02</span><h1>情绪植物园</h1></div></div><div class="garden-top-actions"><span class="weather">今日花园 · {{ living.length }} 株在生长</span><button class="quiet-button" type="button" @click="reset">重置演示</button></div></header>
    <main class="garden-wrap"><section class="garden-hero"><div><span class="eyebrow green-text">DAILY EMOTION CULTIVATION</span><h2>给情绪一块<br /><i>可以生长的土壤。</i></h2><p>你不需要每天都阳光明媚，只需要为此刻诚实地浇一次水。</p></div><div class="garden-stats"><div><strong>{{ report.active }}</strong><span>活跃日</span></div><div><strong>{{ report.lushness }}<small>%</small></strong><span>花园繁茂度</span></div><div><strong>{{ state.entries.length }}</strong><span>情绪标本</span></div></div></section>
      <nav class="garden-tabs"><button v-for="item in TABS" :key="item" type="button" :class="{ active: tab === item }" @click="tab = item">{{ item }}</button></nav>
      <section v-if="tab === '花园'" class="garden-board">
        <div class="board-heading"><div><span class="eyebrow">SELF-SET GOALS</span><h3>我的目标</h3></div><span class="season-label">断签的轮次会留在卡片里，可以重新开始</span></div>
        <div class="goal-grid">
          <article v-for="goal in state.goals" :key="goal.id" class="goal-card" :style="{ '--goal-color': goalColorOf(goal) }">
            <div class="goal-card-top"><span class="goal-kind">{{ goalSymbol(goal) }} {{ goalTitle(goal) }}</span><span class="goal-target">目标 {{ goal.targetDays }} 天</span></div>
            <div class="goal-cycle-now">
              <template v-if="activeCycle(goal)"><strong>{{ activeCycle(goal)!.progressDays }}<small> / {{ activeCycle(goal)!.targetDays }} 天</small></strong><span class="goal-chip doing">进行中</span></template>
              <template v-else><strong class="goal-finished">{{ shownCycle(goal)?.status ?? '未开始' }}</strong><button class="restart-button" type="button" @click="restart(goal)">重新开始 ↻</button></template>
            </div>
            <div class="goal-track"><span :style="{ width: `${goalPercent(goal)}%` }"></span></div>
            <div class="goal-card-bottom"><span>{{ goalFoot(goal) }}</span><button class="quiet-button goal-abandon" type="button" @click="removeGoal(goal)">放弃目标</button></div>
            <ul v-if="pastCycles(goal).length" class="goal-history">
              <li v-for="cycle in pastCycles(goal)" :key="cycle.id" :class="['history-chip', cycle.status === '已达成' ? 'done' : 'broken']">
                <b>{{ cycle.status }}</b>{{ cycle.progressDays }}/{{ cycle.targetDays }} 天 · 止于 {{ cycle.endDate }}
              </li>
            </ul>
          </article>
          <button class="add-goal-card" type="button" @click="openGoalForm"><span>＋</span><strong>设定一个新目标</strong><small>每天一次，或某类情绪连续 N 天</small></button>
        </div>
        <div class="board-heading garden-sub-heading"><div><span class="eyebrow">YOUR EMOTIONAL BIOME</span><h3>正在生长的情绪</h3></div><span class="season-label">秋季 · 第 40 周</span></div><div class="plant-grid"><article v-for="plant in living" :key="plant.id" class="plant-card" :style="{ '--plant-color': EMOTION_META[plant.emotion].color }"><div class="plant-card-top"><span class="plant-status">正在生长</span><span>{{ plant.streak }} 天连续</span></div><div class="plant-illustration"><span class="plant-glow"></span><strong>{{ EMOTION_META[plant.emotion].symbol }}</strong><i v-for="n in Math.min(plant.streak + 1, 5)" :key="n" :style="{ '--n': n }">●</i></div><div class="plant-info"><span class="plant-emotion">{{ plant.emotion }}</span><h4>{{ EMOTION_META[plant.emotion].plant }}</h4><p>{{ EMOTION_META[plant.emotion].hint }}</p><div class="growth-track"><span :style="{ width: `${Math.min(100, Math.max(12, plant.streak / 14 * 100))}%` }"></span></div><small>{{ plant.stage }} · 下一阶段还需 {{ Math.max(0, 3 - plant.streak) }} 天</small></div></article><button class="add-plant-card" type="button" @click="tab = '种植'"><span>＋</span><strong>种下一颗新情绪</strong><small>每天记录，植物就会长大</small></button></div>
      </section>
      <section v-else-if="tab === '种植'" class="planting-layout"><article class="plant-form"><div class="board-heading"><div><span class="eyebrow">PLANT A FEELING</span><h3>今天的你，是什么天气？</h3></div></div><div class="emotion-picker"><button v-for="emotion in EMOTIONS" :key="emotion" type="button" :class="{ selected: selectedEmotion === emotion }" :style="{ '--emotion-color': EMOTION_META[emotion].color }" @click="selectedEmotion = emotion"><span>{{ EMOTION_META[emotion].symbol }}</span><b>{{ emotion }}</b><small>{{ EMOTION_META[emotion].plant }}</small></button></div><label>给这颗情绪留一句话<textarea v-model="draft.note" rows="5" placeholder="它今天为什么来到这里？"></textarea></label><label>情绪强度 <output>{{ draft.intensity }} / 5</output><input v-model.number="draft.intensity" type="range" min="1" max="5" /></label><button class="plant-button" type="button" @click="plant">种下这颗情绪 ✦</button><p class="notice">{{ notice }}</p></article><aside class="plant-preview" :style="{ '--preview-color': EMOTION_META[selectedEmotion].color }"><span class="eyebrow">PREVIEW / {{ selectedEmotion }}</span><div class="preview-plant">{{ EMOTION_META[selectedEmotion].symbol }}</div><h3>{{ EMOTION_META[selectedEmotion].plant }}</h3><p>今天种下，连续记录 3 天后发芽，7 天后开花，14 天后结果。</p></aside></section>
      <section v-else-if="tab === '时间轴'" class="timeline-section"><div class="board-heading"><div><span class="eyebrow">GROWTH TIMELINE</span><h3>每一天，都留下了一片叶子</h3></div></div><div class="timeline"><div v-for="(entry, index) in timeline" :key="entry.id" class="timeline-item"><div class="timeline-date"><strong>{{ new Date(`${entry.date}T00:00:00`).getDate() }}</strong><span>{{ new Date(`${entry.date}T00:00:00`).toLocaleDateString('zh-CN', { month: 'short' }) }}</span></div><div class="timeline-dot" :style="{ background: EMOTION_META[entry.emotion].color }"></div><div class="timeline-content"><div><span class="timeline-emotion" :style="{ color: EMOTION_META[entry.emotion].color }">{{ EMOTION_META[entry.emotion].symbol }} {{ entry.emotion }}</span><span class="intensity">强度 {{ entry.intensity }}/5</span></div><p>{{ entry.note }}</p><small>{{ EMOTION_META[entry.emotion].plant }} · 第 {{ index + 1 }} 片叶子</small></div></div></div></section>
      <section v-else-if="tab === '标本馆'" class="specimen-section"><div class="board-heading"><div><span class="eyebrow">SPECIMEN ARCHIVE</span><h3>枯萎不是消失，是被好好保存</h3></div></div><div v-if="specimens.length" class="specimen-grid"><div v-for="plant in specimens" :key="plant.id" class="specimen-card"><div class="pressed-flower">{{ EMOTION_META[plant.emotion].symbol }}</div><div><span>{{ plant.emotion }} · {{ EMOTION_META[plant.emotion].plant }}</span><strong>生长了 {{ plant.entryIds.length }} 天</strong><small>最后浇水：{{ plant.lastWatered }}</small></div></div></div><div v-else class="empty-state">你的标本馆还是空的。持续记录，等一朵花完成它的季节。</div></section>
      <section v-else-if="tab === '成就'" class="achievement-section"><div class="board-heading"><div><span class="eyebrow">ACHIEVEMENT COLLECTION</span><h3>每一枚徽章，都是和自己签下的约定</h3></div></div><div v-if="achievementsList.length" class="medal-grid"><div v-for="item in achievementsList" :key="item.id" class="medal-card" :style="{ '--medal': achievementVisual(item).color }"><div class="medal-badge">{{ achievementVisual(item).symbol }}</div><div><strong>{{ item.title }}</strong><p>{{ item.description }}</p><small>{{ item.date }} 解锁</small></div></div></div><div v-else class="empty-state">还没有成就。去花园设定一个目标，坚持到约定的那一天。</div></section>
      <section v-else class="report-section"><div class="report-heading"><span class="eyebrow">EMOTIONAL ECOLOGY REPORT · 2026</span><h3>你的情绪生态年报</h3><p>这一年，你和自己的内在天气相处得怎么样？</p></div><div class="report-grid"><div class="report-score"><span>花园繁茂度</span><strong>{{ report.lushness }}<small>/ 100</small></strong><div class="report-progress"><i :style="{ width: `${report.lushness}%` }"></i></div><p>每一次诚实的记录，都会让生态系统更完整。</p></div><div class="top-emotion"><span>最常出现的物种</span><div><strong :style="{ color: EMOTION_META[report.top.emotion].color }">{{ EMOTION_META[report.top.emotion].symbol }}</strong><h4>{{ report.top.emotion }}</h4></div><p>{{ report.top.count }} 次记录 · 是你今年最熟悉的一种天气</p></div><div class="count-chart"><span>情绪物种分布</span><div v-for="item in report.counts" :key="item.emotion" class="count-row"><b>{{ item.emotion }}</b><div><i :style="{ width: `${Math.max(5, item.count / Math.max(report.top.count, 1) * 100)}%`, background: EMOTION_META[item.emotion].color }"></i></div><small>{{ item.count }}</small></div></div></div></section>
    </main>

    <!-- 新建目标 -->
    <div v-if="goalFormOpen" class="dialog-mask" @click.self="goalFormOpen = false">
      <form class="goal-dialog" @submit.prevent="submitGoal">
        <span class="eyebrow">SET A NEW GOAL</span>
        <h3>给自己定一个目标</h3>
        <div class="goal-kind-picker">
          <button type="button" :class="{ selected: goalDraft.kind === 'daily' }" @click="goalDraft.kind = 'daily'"><b>每天记录</b><small>任意情绪，每天记录一次</small></button>
          <button type="button" :class="{ selected: goalDraft.kind === 'emotion' }" @click="goalDraft.kind = 'emotion'"><b>情绪连击</b><small>连续记录某一类情绪</small></button>
        </div>
        <div v-if="goalDraft.kind === 'emotion'" class="goal-emotion-picker">
          <button v-for="emotion in EMOTIONS" :key="emotion" type="button" :class="{ selected: goalDraft.emotion === emotion }" :style="{ '--emotion-color': EMOTION_META[emotion].color }" @click="goalDraft.emotion = emotion"><span>{{ EMOTION_META[emotion].symbol }}</span>{{ emotion }}</button>
        </div>
        <span class="field-label">目标连续天数</span>
        <div class="target-presets">
          <button v-for="n in targetPresets" :key="n" type="button" :class="{ selected: goalDraft.targetDays === n }" @click="goalDraft.targetDays = n">{{ n }} 天</button>
        </div>
        <label class="custom-days">或自定义天数<input v-model.number="goalDraft.targetDays" type="number" min="1" max="365" /></label>
        <p v-if="goalError" class="dialog-error">{{ goalError }}</p>
        <div class="dialog-actions"><button type="button" class="quiet-button" @click="goalFormOpen = false">取消</button><button class="plant-button" type="submit">开始这轮目标</button></div>
      </form>
    </div>

    <!-- 达成当天成就弹窗 -->
    <div v-if="currentAchievement" class="dialog-mask" @click.self="dismissAchievement">
      <div class="achievement-dialog" :style="{ '--medal': achievementVisual(currentAchievement).color }">
        <span class="eyebrow">ACHIEVEMENT UNLOCKED · {{ currentAchievement.date }}</span>
        <div class="achievement-medal">{{ achievementVisual(currentAchievement).symbol }}</div>
        <h3>达成一枚成就</h3>
        <strong class="achievement-title">{{ currentAchievement.title }}</strong>
        <p>{{ currentAchievement.description }}</p>
        <button class="plant-button" type="button" @click="dismissAchievement">收下这枚徽章 ✦</button>
      </div>
    </div>
  </div>
</template>
