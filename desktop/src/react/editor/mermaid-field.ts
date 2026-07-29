import {
  collectKnowledgeMermaidBlocks,
  knowledgeMermaidField,
  type KnowledgeMermaidBlock,
} from './knowledge-mermaid-field';

/** @deprecated Import from knowledge-mermaid-field instead. */
export type MermaidCodeBlock = KnowledgeMermaidBlock;

/** @deprecated Import collectKnowledgeMermaidBlocks instead. */
export function collectMermaidCodeBlocks(
  text: string,
  activeLines: Set<number> = new Set(),
): KnowledgeMermaidBlock[] {
  return collectKnowledgeMermaidBlocks(text).filter((block) => {
    for (let line = block.startLine; line <= block.endLine; line += 1) {
      if (activeLines.has(line)) return false;
    }
    return true;
  });
}

/** @deprecated Import knowledgeMermaidField instead. */
export const mermaidDecoField = knowledgeMermaidField;
