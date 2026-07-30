import {
  StateEffect,
  StateField,
  Transaction,
  type Extension,
  type StateCommand,
} from "@codemirror/state";
import {
  invertedEffects,
  redo,
} from "@codemirror/commands";
import type { EditorView, KeyBinding } from "@codemirror/view";

export type KnowledgeAttachmentRedoPayload = Readonly<{
  execute(): Promise<void>;
}>;

const attachmentInserted = StateEffect.define<
  KnowledgeAttachmentRedoPayload
>();
const attachmentUndone = StateEffect.define<
  KnowledgeAttachmentRedoPayload
>();
const setPendingAttachmentRedo = StateEffect.define<
  KnowledgeAttachmentRedoPayload | null
>();

const pendingAttachmentRedoField = StateField.define<
  KnowledgeAttachmentRedoPayload | null
>({
  create: () => null,
  update(value, transaction) {
    let next = value;
    let attachmentEffect = false;
    for (const effect of transaction.effects) {
      if (effect.is(attachmentUndone)) {
        next = effect.value;
        attachmentEffect = true;
      } else if (effect.is(attachmentInserted)) {
        next = null;
        attachmentEffect = true;
      } else if (effect.is(setPendingAttachmentRedo)) {
        next = effect.value;
        attachmentEffect = true;
      }
    }
    if (transaction.docChanged && !attachmentEffect) return null;
    return next;
  },
});

export const knowledgeAttachmentHistoryExtension: Extension = [
  pendingAttachmentRedoField,
  invertedEffects.of((transaction) => {
    const effects: StateEffect<unknown>[] = [];
    for (const effect of transaction.effects) {
      if (effect.is(attachmentInserted)) {
        effects.push(attachmentUndone.of(effect.value));
      } else if (effect.is(attachmentUndone)) {
        effects.push(attachmentInserted.of(effect.value));
      }
    }
    return effects;
  }),
];

export function knowledgeAttachmentInsertEffect(
  payload: KnowledgeAttachmentRedoPayload,
): StateEffect<KnowledgeAttachmentRedoPayload> {
  return attachmentInserted.of(payload);
}

export function canRedoKnowledgeAttachment(view: EditorView): boolean {
  return view.state.field(pendingAttachmentRedoField, false) !== null;
}

export const redoKnowledgeAttachment: StateCommand = (target) => {
  const view = target as EditorView;
  const payload = view.state.field(pendingAttachmentRedoField, false);
  if (!payload) return false;
  view.dispatch({
    effects: setPendingAttachmentRedo.of(null),
    annotations: Transaction.addToHistory.of(false),
  });
  void payload.execute().catch(() => {
    try {
      view.dispatch({
        effects: setPendingAttachmentRedo.of(payload),
        annotations: Transaction.addToHistory.of(false),
      });
    } catch {
      // The editor may have been destroyed while the copy was in flight.
    }
  });
  return true;
};

export const knowledgeAttachmentHistoryKeymap: readonly KeyBinding[] = [
  {
    key: "Mod-y",
    mac: "Mod-Shift-z",
    linux: "Ctrl-Shift-z",
    run: (view) => redoKnowledgeAttachment(view) || redo(view),
    preventDefault: true,
  },
];
