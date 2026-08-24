import { forwardRef, type CSSProperties, type HTMLAttributes, type ReactNode } from 'react';
import styles from './WorkspaceTreeRow.module.css';

export interface WorkspaceTreeRowProps extends Omit<HTMLAttributes<HTMLDivElement>, 'children'> {
  depth: number;
  disclosure?: ReactNode;
  dropTarget?: boolean;
  iconMarkup: string;
  label?: ReactNode;
  name: string;
  selected?: boolean;
  trailing?: ReactNode;
}

export const WorkspaceTreeRow = forwardRef<HTMLDivElement, WorkspaceTreeRowProps>(
  function WorkspaceTreeRow({
    className,
    depth,
    disclosure,
    dropTarget = false,
    iconMarkup,
    label,
    name,
    selected = false,
    style,
    trailing,
    ...rowProps
  }, ref) {
    const rowClassName = [
      styles.row,
      selected ? styles.selected : '',
      dropTarget ? styles.dropTarget : '',
      className ?? '',
    ].filter(Boolean).join(' ');

    return (
      <div
        {...rowProps}
        aria-label={rowProps['aria-label'] ?? name}
        className={rowClassName}
        data-workspace-tree-row=""
        ref={ref}
        style={{
          ...style,
          '--workspace-tree-depth': depth,
        } as CSSProperties}
        title={rowProps.title ?? name}
      >
        <span aria-hidden="true" className={styles.indent} />
        <span className={styles.disclosure}>{disclosure}</span>
        <span
          aria-hidden="true"
          className={styles.icon}
          dangerouslySetInnerHTML={{ __html: iconMarkup }}
        />
        <span className={styles.name} title={name}>{label ?? name}</span>
        {trailing && <span className={styles.trailing}>{trailing}</span>}
      </div>
    );
  },
);
