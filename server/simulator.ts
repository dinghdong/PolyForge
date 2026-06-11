/**
 * Scripted World Cup match simulator — the demo's "live feed".
 * A 90-minute match compressed to ~3 minutes of wall time. Emits typed
 * events; the agent loop reacts to `goal` / `odds-shift`.
 */
import { EventEmitter } from 'node:events';

export type MatchEvent = {
  kind: 'kickoff' | 'tick' | 'chance' | 'goal' | 'odds-shift' | 'fulltime';
  minute: number;
  teamHome: string;
  teamAway: string;
  scoreHome: number;
  scoreAway: number;
  description: string;
  odds: { home: number; away: number }; // implied probabilities, sum < 1 (vig)
};

export type SimulatorOptions = {
  teamHome?: string;
  teamAway?: string;
  msPerMatchMinute?: number;
  goalMinutes?: { minute: number; side: 'home' | 'away' }[];
};

export class MatchSimulator extends EventEmitter {
  private opts: Required<SimulatorOptions>;
  private timer?: NodeJS.Timeout;
  private minute = 0;
  private score = { home: 0, away: 0 };
  private odds = { home: 0.44, away: 0.36 };
  running = false;

  constructor(opts: SimulatorOptions = {}) {
    super();
    this.opts = {
      teamHome: opts.teamHome ?? 'Brazil',
      teamAway: opts.teamAway ?? 'Germany',
      msPerMatchMinute: opts.msPerMatchMinute ?? 2000,
      goalMinutes: opts.goalMinutes ?? [{ minute: 85, side: 'away' }],
    };
  }

  private emitEvent(kind: MatchEvent['kind'], description: string) {
    const e: MatchEvent = {
      kind,
      minute: this.minute,
      teamHome: this.opts.teamHome,
      teamAway: this.opts.teamAway,
      scoreHome: this.score.home,
      scoreAway: this.score.away,
      description,
      odds: { ...this.odds },
    };
    this.emit('event', e);
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.minute = 0;
    this.score = { home: 0, away: 0 };
    this.odds = { home: 0.44, away: 0.36 };
    this.emitEvent('kickoff', `Kickoff: ${this.opts.teamHome} vs ${this.opts.teamAway} (Group C, World Cup 2026)`);

    this.timer = setInterval(() => {
      this.minute += 1;

      const goal = this.opts.goalMinutes.find((g) => g.minute === this.minute);
      if (goal) {
        if (goal.side === 'home') {
          this.score.home += 1;
          this.odds = { home: Math.min(0.93, this.odds.home + 0.35), away: Math.max(0.03, this.odds.away - 0.3) };
        } else {
          this.score.away += 1;
          this.odds = { home: Math.max(0.03, this.odds.home - 0.3), away: Math.min(0.93, this.odds.away + 0.35) };
        }
        const scorer = goal.side === 'home' ? this.opts.teamHome : this.opts.teamAway;
        this.emitEvent('goal', `GOAL! ${scorer} scores at ${this.minute}' — books repricing, momentary dislocation`);
        return;
      }

      if (this.minute >= 90) {
        this.emitEvent('fulltime', `Full time: ${this.opts.teamHome} ${this.score.home} – ${this.score.away} ${this.opts.teamAway}`);
        this.stop();
        return;
      }

      // gentle drift + periodic talking points
      const drift = (Math.random() - 0.5) * 0.02;
      this.odds = {
        home: Math.min(0.9, Math.max(0.05, this.odds.home + drift)),
        away: Math.min(0.9, Math.max(0.05, this.odds.away - drift)),
      };
      if (this.minute % 15 === 0) {
        this.emitEvent('odds-shift', `Books reprice at ${this.minute}' — implied ${this.opts.teamHome} ${this.odds.home.toFixed(2)} / ${this.opts.teamAway} ${this.odds.away.toFixed(2)}`);
      } else if (this.minute % 7 === 0) {
        this.emitEvent('chance', `${this.minute}': half-chance for ${Math.random() > 0.5 ? this.opts.teamHome : this.opts.teamAway}`);
      } else {
        this.emitEvent('tick', `${this.minute}'`);
      }
    }, this.opts.msPerMatchMinute);
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
    this.running = false;
  }
}
