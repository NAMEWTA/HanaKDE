import type { KnowledgeResourceAddress } from '../../../../../shared/knowledge-workspace-contract.ts';
import {
  knowledgeDropEffect,
  type KnowledgeDragPayload,
  type KnowledgeDropEffect,
} from '../../../../../shared/knowledge-drag-contract.ts';

export type KnowledgeDragTarget = Readonly<{
  address: Readonly<{ sourceKey: string; directoryPath: string }>;
  directory: boolean;
  expanded: boolean;
}>;

export type KnowledgeDragState = Readonly<{
  payload: KnowledgeDragPayload | null;
  target: KnowledgeDragTarget | null;
  effect: KnowledgeDropEffect;
  edgeScroll: -1 | 0 | 1;
}>;

export class KnowledgeDragController {
  readonly #onExpand: (address: KnowledgeDragTarget['address']) => void;
  readonly #onState: (state: KnowledgeDragState) => void;
  readonly #setTimer: typeof setTimeout;
  readonly #clearTimer: typeof clearTimeout;
  #state: KnowledgeDragState = Object.freeze({
    payload: null,
    target: null,
    effect: 'none',
    edgeScroll: 0,
  });
  #hoverTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(input: {
    onExpand(address: KnowledgeDragTarget['address']): void;
    onState?(state: KnowledgeDragState): void;
    setTimer?: typeof setTimeout;
    clearTimer?: typeof clearTimeout;
  }) {
    this.#onExpand = input.onExpand;
    this.#onState = input.onState ?? (() => {});
    this.#setTimer = input.setTimer ?? setTimeout;
    this.#clearTimer = input.clearTimer ?? clearTimeout;
  }

  state(): KnowledgeDragState {
    return this.#state;
  }

  begin(payload: KnowledgeDragPayload): void {
    this.cancel();
    this.#update({ payload, target: null, effect: 'none', edgeScroll: 0 });
  }

  hover(target: KnowledgeDragTarget | null, pointerYRatio = 0.5): void {
    this.#clearHover();
    const effect = knowledgeDropEffect(this.#state.payload, target && {
      sourceKey: target.address.sourceKey,
      directory: target.directory,
    });
    const edgeScroll = pointerYRatio < 0.1 ? -1 : pointerYRatio > 0.9 ? 1 : 0;
    this.#update({ ...this.#state, target, effect, edgeScroll });
    if (target?.directory && !target.expanded && effect !== 'none') {
      this.#hoverTimer = this.#setTimer(() => {
        this.#hoverTimer = null;
        this.#onExpand(target.address);
      }, 800);
    }
  }

  drop(): Readonly<{
    payload: KnowledgeDragPayload;
    target: KnowledgeDragTarget;
    effect: Exclude<KnowledgeDropEffect, 'none'>;
  }> | null {
    const { payload, target, effect } = this.#state;
    if (!payload || !target || effect === 'none') {
      this.cancel();
      return null;
    }
    const result = Object.freeze({ payload, target, effect });
    this.cancel();
    return result;
  }

  complete(_selection: readonly KnowledgeResourceAddress[]): void {
    this.cancel();
  }

  cancel(): void {
    this.#clearHover();
    this.#update({ payload: null, target: null, effect: 'none', edgeScroll: 0 });
  }

  dispose(): void {
    this.cancel();
  }

  #clearHover(): void {
    if (this.#hoverTimer) this.#clearTimer(this.#hoverTimer);
    this.#hoverTimer = null;
  }

  #update(state: KnowledgeDragState): void {
    this.#state = Object.freeze(state);
    this.#onState(this.#state);
  }
}
