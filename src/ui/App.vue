<script setup lang="ts">
import { computed, reactive, ref } from 'vue';
import { LocalGardenRepository } from '../adapters/local-garden.repository';
import { EMOTION_META, EMOTIONS, type Achievement, type Emotion, type Goal, type GoalAttempt, type GoalType } from '../core/models';
import { annualReport, createEntry, createGoal, entryDates, restartAttempt, sampleSnapshot, syncGoals, syncPlants, todayStr } from '../core/garden-engine';

const repo = new LocalGardenRepository();
const state = reactive(repo.load());
const tab = ref<'花园' | '种植' | '时间轴' | '标本馆' | '成就' | '年报'>('花园');
const selectedEmotion = ref<Emotion>('喜悦');
const notice = ref('');
const draft = reactive({ note: '', intensity: 3 });
const goalFormOpen = ref(false);
const goalDraft = reactive<{ type: GoalType; emotion: Emotion; days: number; title: string }>({ type: 'daily', emotion: '平静', days: 7, title: '' });
const unlocked = ref<Achievement[]>([]);
const currentUnlock = computed(() => unlocked.value[0]);
const report = computed(() => annualReport(state.entries));
const living = computed(() => state.plants.filter((plant) => plant.status === '繁茂'));
const specimens = computed(() => state.plants.filter((plant) => plant.status === '枯萎'));
const timeline = computed(() => [...state.entries].sort((a, b) => b.date.localeCompare(a.date)));

interface GoalCard { goal: Goal; current: GoalAttempt; interrupted: GoalAttempt[]; }
const goalCards = computed<GoalCard[]>(() => state.goals.map((goal) => {
  const own = state.attempts.filter((attempt) => attempt.goalId === goal.id).sort((a, b) => b.cycle - a.cycle);
  return { goal, current: own[0], interrupted: own.filter((attempt) => attempt.status === 'interrupted') };
}));
const achievementList = computed(() => [...state.achievements].sort((a, b) => b.date.localeCompare(a.date)));
const interruptedRecords = computed(() => goalCards.value
  .flatMap((card) => card.interrupted.map((attempt) => ({ goal: card.goal, attempt, latest: card.current.id === attempt.id })))
  .sort((a, b) => (b.attempt.endDate ?? '').localeCompare(a.attempt.endDate ?? '')));

function save() {
  state.plants = syncPlants(state.entries, state.plants);
  const synced = syncGoals(state.entries, state.goals, state.attempts, state.achievements);
  state.attempts = synced.attempts;
  state.achievements = synced.achievements;
  if (synced.unlocked.length) unlocked.value.push(...synced.unlocked);
  repo.save({ entries: state.entries, plants: state.plants, goals: state.goals, attempts: state.attempts, achievements: state.achievements });
}
function plant() { state.entries.unshift(createEntry(selectedEmotion.value, draft.note, draft.intensity)); draft.note = ''; save(); notice.value = `${EMOTION_META[selectedEmotion.value].plant} 已经种下`; tab.value = '花园'; }
function reset() { const fresh = sampleSnapshot(); state.entries = fresh.entries; state.plants = fresh.plants; state.goals = fresh.goals; state.attempts = fresh.attempts; state.achievements = fresh.achievements; save(); notice.value = '已恢复初始示例花园'; }
function addGoal() {
  const { goal, attempt } = createGoal(goalDraft.type, goalDraft.days, goalDraft.emotion, goalDraft.title);
  state.goals.push(goal); state.attempts.push(attempt);
  goalDraft.title = ''; goalFormOpen.value = false;
  save(); notice.value = `目标「${goal.title}」已创建，从今天开始计数`;
}
function restart(goalId: string) {
  const latest = state.attempts.filter((attempt) => attempt.goalId === goalId).sort((a, b) => b.cycle - a.cycle)[0];
  if (latest && latest.status === 'active') return;
  state.attempts.push(restartAttempt(goalId, state.attempts));
  save(); notice.value = '新一轮挑战已开始，只累计本轮的天数';
}
function removeGoal(goalId: string) {
  state.goals = state.goals.filter((goal) => goal.id !== goalId);
  state.attempts = state.attempts.filter((attempt) => attempt.goalId !== goalId);
  save(); notice.value = '目标已删除，已获得的成就会保留';
}
function dismissUnlock() { unlocked.value.shift(); }
function recordedToday(card: GoalCard): boolean { return entryDates(state.entries, card.goal.type === 'emotion' ? card.goal.emotion : undefined).has(todayStr()); }
save(); // 打开花园时先按同一口径结算一次：刷新进度、检测断签
</script>

<template>
  <div class="garden-app">
    <header class="garden-topbar"><div class="garden-brand"><span class="garden-mark">✿</span><div><span class="eyebrow">THE INNER GARDEN / 02</span><h1>情绪植物园</h1></div></div><div class="garden-top-actions"><span class="weather">今日花园 · {{ living.length }} 株在生长</span><button class="quiet-button" type="button" @click="reset">重置演示</button></div></header>
    <main class="garden-wrap"><section class="garden-hero"><div><span class="eyebrow green-text">DAILY EMOTION CULTIVATION</span><h2>给情绪一块<br /><i>可以生长的土壤。</i></h2><p>你不需要每天都阳光明媚，只需要为此刻诚实地浇一次水。</p></div><div class="garden-stats"><div><strong>{{ report.active }}</strong><span>活跃日</span></div><div><strong>{{ report.lushness }}<small>%</small></strong><span>花园繁茂度</span></div><div><strong>{{ state.entries.length }}</strong><span>情绪标本</span></div></div></section>
      <nav class="garden-tabs"><button v-for="item in ['花园', '种植', '时间轴', '标本馆', '成就', '年报']" :key="item" type="button" :class="{ active: tab === item }" @click="tab = item as typeof tab">{{ item }}</button></nav>
      <div v-if="tab === '花园'" class="garden-home"><section class="garden-board"><div class="board-heading"><div><span class="eyebrow">YOUR EMOTIONAL BIOME</span><h3>正在生长的情绪</h3></div><span class="season-label">秋季 · 第 40 周</span></div><div class="plant-grid"><article v-for="plant in living" :key="plant.id" class="plant-card" :style="{ '--plant-color': EMOTION_META[plant.emotion].color }"><div class="plant-card-top"><span class="plant-status">正在生长</span><span>{{ plant.streak }} 天连续</span></div><div class="plant-illustration"><span class="plant-glow"></span><strong>{{ EMOTION_META[plant.emotion].symbol }}</strong><i v-for="n in Math.min(plant.streak + 1, 5)" :key="n" :style="{ '--n': n }">●</i></div><div class="plant-info"><span class="plant-emotion">{{ plant.emotion }}</span><h4>{{ EMOTION_META[plant.emotion].plant }}</h4><p>{{ EMOTION_META[plant.emotion].hint }}</p><div class="growth-track"><span :style="{ width: `${Math.min(100, Math.max(12, plant.streak / 14 * 100))}%` }"></span></div><small>{{ plant.stage }} · 下一阶段还需 {{ Math.max(0, 3 - plant.streak) }} 天</small></div></article><button class="add-plant-card" type="button" @click="tab = '种植'"><span>＋</span><strong>种下一颗新情绪</strong><small>每天记录，植物就会长大</small></button></div></section>
        <section class="goal-section"><div class="board-heading"><div><span class="eyebrow">RECORD GOALS</span><h3>记录目标</h3></div><button class="quiet-button" type="button" @click="goalFormOpen = !goalFormOpen">{{ goalFormOpen ? '收起' : '＋ 新目标' }}</button></div>
          <form v-if="goalFormOpen" class="goal-form" @submit.prevent="addGoal">
            <div class="goal-form-row"><span class="goal-form-label">目标类型</span><button type="button" :class="{ selected: goalDraft.type === 'daily' }" @click="goalDraft.type = 'daily'">每天记录一次</button><button type="button" :class="{ selected: goalDraft.type === 'emotion' }" @click="goalDraft.type = 'emotion'">某一类情绪连续记录</button></div>
            <div v-if="goalDraft.type === 'emotion'" class="goal-form-row"><span class="goal-form-label">情绪种类</span><button v-for="emotion in EMOTIONS" :key="emotion" type="button" class="goal-emotion" :class="{ selected: goalDraft.emotion === emotion }" :style="{ '--emotion-color': EMOTION_META[emotion].color }" @click="goalDraft.emotion = emotion">{{ EMOTION_META[emotion].symbol }} {{ emotion }}</button></div>
            <div class="goal-form-row"><span class="goal-form-label">连续天数</span><button v-for="days in [3, 7, 14, 21]" :key="days" type="button" :class="{ selected: goalDraft.days === days }" @click="goalDraft.days = days">{{ days }} 天</button><input v-model.number="goalDraft.days" type="number" min="1" max="365" /></div>
            <div class="goal-form-row"><span class="goal-form-label">目标名称</span><input v-model="goalDraft.title" class="goal-title-input" type="text" :placeholder="goalDraft.type === 'daily' ? `每天记录一次 · 连续 ${goalDraft.days} 天` : `连续 ${goalDraft.days} 天记录「${goalDraft.emotion}」`" /></div>
            <button class="plant-button" type="submit">定下这个目标 ✦</button>
          </form>
          <div v-if="goalCards.length" class="goal-grid"><article v-for="card in goalCards" :key="card.goal.id" class="goal-card" :class="`is-${card.current.status}`">
            <div class="goal-card-top"><span class="goal-type">{{ card.goal.type === 'daily' ? '每日记录' : `情绪 · ${card.goal.emotion}` }}</span><span class="goal-badge">{{ card.current.status === 'active' ? '进行中' : card.current.status === 'completed' ? '已完成' : '已中断' }}</span></div>
            <h4>{{ card.goal.title }}</h4>
            <div class="goal-progress"><span :style="{ width: `${Math.min(100, (card.current.progressDays / card.goal.targetDays) * 100)}%` }"></span></div>
            <small v-if="card.current.status === 'active'">第 {{ card.current.cycle }} 轮 · 已连续 {{ card.current.progressDays }} / {{ card.goal.targetDays }} 天 · 今天{{ recordedToday(card) ? '已记录 ✓' : '还没记录' }}</small>
            <small v-else-if="card.current.status === 'interrupted'" class="interrupted-text">第 {{ card.current.cycle }} 轮已中断 · 坚持了 {{ card.current.progressDays }} / {{ card.goal.targetDays }} 天 · {{ card.current.endDate }} 断签</small>
            <small v-else class="completed-text">第 {{ card.current.cycle }} 轮已完成 · {{ card.current.endDate }} 达成</small>
            <div class="goal-actions"><button v-if="card.current.status === 'interrupted'" type="button" @click="restart(card.goal.id)">重新开始</button><button v-if="card.current.status === 'completed'" type="button" @click="restart(card.goal.id)">再来一轮</button><button class="goal-delete" type="button" @click="removeGoal(card.goal.id)">删除</button></div>
          </article></div>
          <div v-else class="empty-state">还没有目标。定一个小目标，让记录有方向。</div>
        </section>
      </div>
      <section v-else-if="tab === '种植'" class="planting-layout"><article class="plant-form"><div class="board-heading"><div><span class="eyebrow">PLANT A FEELING</span><h3>今天的你，是什么天气？</h3></div></div><div class="emotion-picker"><button v-for="emotion in EMOTIONS" :key="emotion" type="button" :class="{ selected: selectedEmotion === emotion }" :style="{ '--emotion-color': EMOTION_META[emotion].color }" @click="selectedEmotion = emotion"><span>{{ EMOTION_META[emotion].symbol }}</span><b>{{ emotion }}</b><small>{{ EMOTION_META[emotion].plant }}</small></button></div><label>给这颗情绪留一句话<textarea v-model="draft.note" rows="5" placeholder="它今天为什么来到这里？"></textarea></label><label>情绪强度 <output>{{ draft.intensity }} / 5</output><input v-model.number="draft.intensity" type="range" min="1" max="5" /></label><button class="plant-button" type="button" @click="plant">种下这颗情绪 ✦</button><p class="notice">{{ notice }}</p></article><aside class="plant-preview" :style="{ '--preview-color': EMOTION_META[selectedEmotion].color }"><span class="eyebrow">PREVIEW / {{ selectedEmotion }}</span><div class="preview-plant">{{ EMOTION_META[selectedEmotion].symbol }}</div><h3>{{ EMOTION_META[selectedEmotion].plant }}</h3><p>今天种下，连续记录 3 天后发芽，7 天后开花，14 天后结果。</p></aside></section>
      <section v-else-if="tab === '时间轴'" class="timeline-section"><div class="board-heading"><div><span class="eyebrow">GROWTH TIMELINE</span><h3>每一天，都留下了一片叶子</h3></div></div><div class="timeline"><div v-for="(entry, index) in timeline" :key="entry.id" class="timeline-item"><div class="timeline-date"><strong>{{ new Date(`${entry.date}T00:00:00`).getDate() }}</strong><span>{{ new Date(`${entry.date}T00:00:00`).toLocaleDateString('zh-CN', { month: 'short' }) }}</span></div><div class="timeline-dot" :style="{ background: EMOTION_META[entry.emotion].color }"></div><div class="timeline-content"><div><span class="timeline-emotion" :style="{ color: EMOTION_META[entry.emotion].color }">{{ EMOTION_META[entry.emotion].symbol }} {{ entry.emotion }}</span><span class="intensity">强度 {{ entry.intensity }}/5</span></div><p>{{ entry.note }}</p><small>{{ EMOTION_META[entry.emotion].plant }} · 第 {{ index + 1 }} 片叶子</small></div></div></div></section>
      <section v-else-if="tab === '标本馆'" class="specimen-section"><div class="board-heading"><div><span class="eyebrow">SPECIMEN ARCHIVE</span><h3>枯萎不是消失，是被好好保存</h3></div></div><div v-if="specimens.length" class="specimen-grid"><div v-for="plant in specimens" :key="plant.id" class="specimen-card"><div class="pressed-flower">{{ EMOTION_META[plant.emotion].symbol }}</div><div><span>{{ plant.emotion }} · {{ EMOTION_META[plant.emotion].plant }}</span><strong>生长了 {{ plant.entryIds.length }} 天</strong><small>最后浇水：{{ plant.lastWatered }}</small></div></div></div><div v-else class="empty-state">你的标本馆还是空的。持续记录，等一朵花完成它的季节。</div></section>
      <section v-else-if="tab === '成就'" class="achievement-section"><div class="board-heading"><div><span class="eyebrow">ACHIEVEMENTS</span><h3>成就馆 · 每一枚都是坚持过的证据</h3></div></div>
        <div v-if="achievementList.length" class="achievement-grid"><div v-for="item in achievementList" :key="item.id" class="achievement-card"><div class="achievement-medal">✦</div><div><span>{{ item.date }} · 第 {{ item.cycle }} 轮挑战</span><strong>{{ item.title }}</strong><small>连续 {{ item.targetDays }} 天达成</small></div></div></div>
        <div v-else class="empty-state">成就馆还空着。完成一个目标，就能点亮第一枚成就。</div>
        <div class="board-heading interrupted-heading"><div><span class="eyebrow">INTERRUPTED ATTEMPTS</span><h3>中断的挑战</h3></div></div>
        <div v-if="interruptedRecords.length" class="interrupted-list"><div v-for="record in interruptedRecords" :key="record.attempt.id" class="interrupted-card"><span class="interrupted-badge">已中断</span><div><strong>{{ record.goal.title }}</strong><small>第 {{ record.attempt.cycle }} 轮 · 坚持 {{ record.attempt.progressDays }} / {{ record.goal.targetDays }} 天 · {{ record.attempt.startDate }} 开始，{{ record.attempt.endDate }} 断签</small></div><button v-if="record.latest" type="button" @click="restart(record.goal.id)">重新开始</button></div></div>
        <div v-else class="empty-state">没有中断的记录。每一次坚持都还在路上。</div>
      </section>
      <section v-else class="report-section"><div class="report-heading"><span class="eyebrow">EMOTIONAL ECOLOGY REPORT · 2026</span><h3>你的情绪生态年报</h3><p>这一年，你和自己的内在天气相处得怎么样？</p></div><div class="report-grid"><div class="report-score"><span>花园繁茂度</span><strong>{{ report.lushness }}<small>/ 100</small></strong><div class="report-progress"><i :style="{ width: `${report.lushness}%` }"></i></div><p>每一次诚实的记录，都会让生态系统更完整。</p></div><div class="top-emotion"><span>最常出现的物种</span><div><strong :style="{ color: EMOTION_META[report.top.emotion].color }">{{ EMOTION_META[report.top.emotion].symbol }}</strong><h4>{{ report.top.emotion }}</h4></div><p>{{ report.top.count }} 次记录 · 是你今年最熟悉的一种天气</p></div><div class="count-chart"><span>情绪物种分布</span><div v-for="item in report.counts" :key="item.emotion" class="count-row"><b>{{ item.emotion }}</b><div><i :style="{ width: `${Math.max(5, item.count / Math.max(report.top.count, 1) * 100)}%`, background: EMOTION_META[item.emotion].color }"></i></div><small>{{ item.count }}</small></div></div></div></section>
    </main>
    <div v-if="currentUnlock" class="achievement-overlay" @click.self="dismissUnlock"><div class="achievement-modal"><span class="eyebrow">GOAL ACHIEVED</span><div class="achievement-medal">✦</div><h3>目标达成！</h3><p>「{{ currentUnlock.title }}」</p><small>{{ currentUnlock.date }} · 第 {{ currentUnlock.cycle }} 轮挑战 · 连续 {{ currentUnlock.targetDays }} 天</small><button type="button" @click="dismissUnlock">收下这枚成就</button></div></div>
  </div>
</template>
