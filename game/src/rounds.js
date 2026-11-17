// Rounds and the economy: freeze time to buy, a live round, the planted-bomb
// countdown, and the score. First to 5 round wins takes the match (at most 9
// rounds). Money follows the usual shape: win pays, loss pays less, kills pay.
export const ROUND_TIME = 100;
export const FREEZE_TIME = 12;
export const WIN_SCORE = 5;
export const MAX_ROUNDS = 9;
export const WIN_MONEY = 3250;
export const LOSS_MONEY = 1900;
export const KILL_MONEY = 300;
export const START_MONEY = 800;

export function createMatch() {
  const state = {
    round: 1,
    phase: 'freeze', // freeze | live | planted | over
    phaseTime: FREEZE_TIME,
    score: { ally: 0, enemy: 0 },
    money: START_MONEY,
    kills: 0,
    deaths: 0,
    roundWinner: null,
    roundReason: '',
    matchWinner: null,
    lossStreak: 0,
  };

  return {
    state,
    reset() {
      state.round = 1;
      state.phase = 'freeze';
      state.phaseTime = FREEZE_TIME;
      state.score.ally = 0;
      state.score.enemy = 0;
      state.money = START_MONEY;
      state.kills = 0;
      state.deaths = 0;
      state.roundWinner = null;
      state.roundReason = '';
      state.matchWinner = null;
      state.lossStreak = 0;
    },
    startRound() {
      state.phase = 'freeze';
      state.phaseTime = FREEZE_TIME;
      state.roundWinner = null;
      state.roundReason = '';
    },
    goLive() {
      state.phase = 'live';
      state.phaseTime = ROUND_TIME;
    },
    endRound(winner, reason) {
      if (state.phase === 'over') return;
      state.phase = 'over';
      state.phaseTime = 5;
      state.roundWinner = winner;
      state.roundReason = reason;
      state.score[winner] += 1;
      if (winner === 'ally') {
        state.money += WIN_MONEY;
        state.lossStreak = 0;
      } else {
        state.lossStreak += 1;
        state.money += LOSS_MONEY + Math.min(3, state.lossStreak - 1) * 500;
      }
      if (state.score.ally >= WIN_SCORE || state.score.enemy >= WIN_SCORE || state.round >= MAX_ROUNDS) {
        state.matchWinner = state.score.ally > state.score.enemy ? 'ally' : state.score.enemy > state.score.ally ? 'enemy' : 'draw';
      }
    },
    nextRound() {
      state.round += 1;
      this.startRound();
    },
    addKill() {
      state.kills += 1;
      state.money += KILL_MONEY;
    },
    spend(amount) {
      if (state.money < amount) return false;
      state.money -= amount;
      return true;
    },
  };
}
