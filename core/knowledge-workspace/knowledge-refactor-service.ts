import type { KnowledgeResourceAddress } from '../../shared/knowledge-workspace-contract.ts';
import { createKnowledgeWorkspaceError } from '../../shared/knowledge-workspace-errors.ts';
import { KNOWLEDGE_MARKDOWN_MAX_BYTES } from '../../shared/knowledge-workspace-contract.ts';
import { rewriteKnowledgeMarkdownLinks } from '../../lib/knowledge-workspace/markdown-link-rewriter.ts';
import type {
  ResourceOperationContext,
  ResourceReadResult,
  ResourceRef,
  ResourceStat,
  ResourceWriteExpectedVersionResult,
} from '../../lib/resource-io/types.ts';

type SourceRegistrySurface = {
  resolveAddress(address: KnowledgeResourceAddress): Promise<ResourceRef>;
  revalidate(sourceKey: string): Promise<void>;
};
type ResourceIoSurface = {
  stat(ref: ResourceRef, context?: ResourceOperationContext): Promise<ResourceStat>;
  read(ref: ResourceRef, context?: ResourceOperationContext): Promise<ResourceReadResult>;
  writeExpectedVersion(
    ref: ResourceRef,
    content: string | Buffer,
    expectedVersion: ResourceStat['version'] | null,
    context?: ResourceOperationContext,
  ): Promise<ResourceWriteExpectedVersionResult>;
};

export class KnowledgeRefactorService {
  readonly #sourceRegistry: SourceRegistrySurface;
  readonly #resourceIO: ResourceIoSurface;
  readonly #findSavedBacklinks: (address: KnowledgeResourceAddress) => Promise<readonly KnowledgeResourceAddress[]>;

  constructor(input: {
    sourceRegistry: SourceRegistrySurface;
    resourceIO: ResourceIoSurface;
    findSavedBacklinks(address: KnowledgeResourceAddress): Promise<readonly KnowledgeResourceAddress[]>;
  }) {
    this.#sourceRegistry = input.sourceRegistry;
    this.#resourceIO = input.resourceIO;
    this.#findSavedBacklinks = input.findSavedBacklinks;
  }

  async rewriteSavedLinks(input: Readonly<{
    operationId: string;
    from: KnowledgeResourceAddress;
    to: KnowledgeResourceAddress;
    context: ResourceOperationContext;
  }>): Promise<void> {
    await this.#sourceRegistry.revalidate(input.from.sourceKey);
    const pages = uniqueAddresses(await this.#findSavedBacklinks(input.from));
    const writes: Array<{
      address: KnowledgeResourceAddress;
      ref: ResourceRef;
      before: Buffer;
      after: Buffer;
      expected: ResourceStat['version'];
      applied?: ResourceStat['version'];
    }> = [];
    for (const address of pages) {
      const ref = await this.#sourceRegistry.resolveAddress(address);
      const stat = await this.#resourceIO.stat(ref, input.context);
      if (!stat.exists || stat.isDirectory || (stat.version?.size ?? 0) > KNOWLEDGE_MARKDOWN_MAX_BYTES) {
        throw linkFailure('saved backlink page is not safely rewritable');
      }
      const read = await this.#resourceIO.read(ref, input.context);
      if (!read.version) throw linkFailure('saved backlink version is unavailable');
      const source = read.content.toString('utf8');
      if (!Buffer.from(source, 'utf8').equals(read.content)) {
        throw linkFailure('saved backlink is not valid UTF-8');
      }
      const rewritten = rewriteKnowledgeMarkdownLinks({
        source,
        pageAddress: address,
        from: input.from,
        to: input.to,
      });
      if (rewritten.changed) writes.push({
        address,
        ref,
        before: read.content,
        after: Buffer.from(rewritten.source, 'utf8'),
        expected: read.version,
      });
    }
    const applied: typeof writes = [];
    try {
      for (const write of writes) {
        const result = await this.#resourceIO.writeExpectedVersion(
          write.ref,
          write.after,
          write.expected ?? null,
          { ...input.context, operationId: input.operationId, emit: false },
        );
        if ('conflict' in result && result.conflict) throw linkFailure('saved backlink changed during refactor');
        write.applied = result.version;
        applied.push(write);
      }
    } catch (error) {
      for (const write of [...applied].reverse()) {
        const rollback = await this.#resourceIO.writeExpectedVersion(
          write.ref,
          write.before,
          write.applied ?? null,
          { ...input.context, operationId: input.operationId, emit: false, reason: 'rollback' },
        );
        if ('conflict' in rollback && rollback.conflict) {
          throw linkFailure('saved backlink rollback requires recovery');
        }
      }
      throw error;
    }
  }
}

function uniqueAddresses(addresses: readonly KnowledgeResourceAddress[]): KnowledgeResourceAddress[] {
  return [...new Map(addresses.map(address => [`${address.sourceKey}\0${address.relativePath}`, address])).values()];
}
function linkFailure(message: string) {
  return createKnowledgeWorkspaceError('knowledge_link_rewrite_failed', message);
}
