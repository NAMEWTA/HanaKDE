import {
  StateField,
  Transaction,
  type EditorState,
} from '@codemirror/state';
import {
  Decoration,
  EditorView,
  WidgetType,
  type DecorationSet,
} from '@codemirror/view';
import {
  deleteFrontmatterProperty,
  isFrontmatterEditableValue,
  projectFrontmatter,
  setFrontmatterProperty,
  type FrontmatterEditableValue,
  type FrontmatterProjectedField,
  type FrontmatterProjection,
} from '../../../../lib/knowledge-workspace/frontmatter-projection.ts';

interface FrontmatterFieldState {
  projection: FrontmatterProjection;
  decorations: DecorationSet;
}

function tr(key: string, vars?: Record<string, string | number>): string {
  return window.t?.(key, vars) ?? key;
}

function serializedValue(value: FrontmatterEditableValue): string {
  return JSON.stringify(value);
}

function parseEditableInput(value: string): FrontmatterEditableValue | null {
  try {
    const parsed: unknown = JSON.parse(value);
    return isFrontmatterEditableValue(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function setFrontmatterFieldValue(
  view: EditorView,
  key: string,
  value: FrontmatterEditableValue,
): boolean {
  const patch = setFrontmatterProperty(view.state.doc.toString(), key, value);
  if (!patch.ok) return false;
  view.dispatch({
    changes: patch,
    annotations: Transaction.userEvent.of('input'),
  });
  return true;
}

export function deleteFrontmatterFieldValue(
  view: EditorView,
  key: string,
): boolean {
  const patch = deleteFrontmatterProperty(view.state.doc.toString(), key);
  if (!patch.ok) return false;
  view.dispatch({
    changes: patch,
    annotations: Transaction.userEvent.of('delete'),
  });
  return true;
}

function button(
  className: string,
  label: string,
  onClick: () => void,
): HTMLButtonElement {
  const element = document.createElement('button');
  element.className = className;
  element.type = 'button';
  element.textContent = label;
  element.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    onClick();
  });
  return element;
}

function showInvalid(input: HTMLInputElement, status: HTMLElement): void {
  input.setAttribute('aria-invalid', 'true');
  status.textContent = tr('knowledge.frontmatter.invalidValue');
  status.hidden = false;
  input.focus();
}

function fieldRow(
  view: EditorView,
  field: FrontmatterProjectedField,
  status: HTMLElement,
): HTMLElement {
  const row = document.createElement('div');
  row.className = 'cm-frontmatter-row';

  const key = document.createElement('span');
  key.className = 'cm-frontmatter-key';
  key.textContent = field.key;
  row.appendChild(key);

  const input = document.createElement('input');
  input.className = 'cm-frontmatter-value';
  input.type = 'text';
  input.value = serializedValue(field.value);
  input.setAttribute('aria-label', tr('knowledge.frontmatter.editValue', {
    key: field.key,
  }));
  input.addEventListener('input', () => {
    input.removeAttribute('aria-invalid');
    status.hidden = true;
  });
  row.appendChild(input);

  row.appendChild(button(
    'cm-frontmatter-apply',
    tr('knowledge.frontmatter.apply'),
    () => {
      const value = parseEditableInput(input.value);
      if (value === null && input.value.trim() !== 'null') {
        showInvalid(input, status);
        return;
      }
      if (!setFrontmatterFieldValue(view, field.key, value)) {
        showInvalid(input, status);
      }
    },
  ));
  row.appendChild(button(
    'cm-frontmatter-delete',
    tr('knowledge.frontmatter.delete'),
    () => {
      deleteFrontmatterFieldValue(view, field.key);
    },
  ));
  return row;
}

class FrontmatterPropertiesWidget extends WidgetType {
  constructor(
    private readonly fields: readonly FrontmatterProjectedField[],
  ) {
    super();
  }

  eq(other: FrontmatterPropertiesWidget): boolean {
    return JSON.stringify(other.fields.map(field => [field.key, field.value]))
      === JSON.stringify(this.fields.map(field => [field.key, field.value]));
  }

  toDOM(view: EditorView): HTMLElement {
    const region = document.createElement('section');
    region.className = 'cm-frontmatter-properties';
    region.contentEditable = 'false';
    region.setAttribute('aria-label', tr('knowledge.frontmatter.label'));

    const heading = document.createElement('div');
    heading.className = 'cm-frontmatter-heading';
    heading.textContent = tr('knowledge.frontmatter.title');
    region.appendChild(heading);

    const status = document.createElement('p');
    status.className = 'cm-frontmatter-status';
    status.setAttribute('role', 'alert');
    status.hidden = true;

    const rows = document.createElement('div');
    rows.className = 'cm-frontmatter-rows';
    for (const field of this.fields) {
      rows.appendChild(fieldRow(view, field, status));
    }
    region.appendChild(rows);

    const add = document.createElement('div');
    add.className = 'cm-frontmatter-add';
    const keyInput = document.createElement('input');
    keyInput.className = 'cm-frontmatter-new-key';
    keyInput.type = 'text';
    keyInput.placeholder = tr('knowledge.frontmatter.newKey');
    keyInput.setAttribute('aria-label', tr('knowledge.frontmatter.newKey'));
    const valueInput = document.createElement('input');
    valueInput.className = 'cm-frontmatter-new-value';
    valueInput.type = 'text';
    valueInput.value = 'null';
    valueInput.setAttribute('aria-label', tr('knowledge.frontmatter.newValue'));
    add.append(keyInput, valueInput);
    add.appendChild(button(
      'cm-frontmatter-add-button',
      tr('knowledge.frontmatter.add'),
      () => {
        const value = parseEditableInput(valueInput.value);
        if (
          !keyInput.value.trim()
          || (value === null && valueInput.value.trim() !== 'null')
          || !setFrontmatterFieldValue(view, keyInput.value, value)
        ) {
          showInvalid(
            value === null && valueInput.value.trim() !== 'null'
              ? valueInput
              : keyInput,
            status,
          );
        }
      },
    ));
    region.appendChild(add);
    region.appendChild(status);
    return region;
  }
}

function buildFrontmatterFieldState(state: EditorState): FrontmatterFieldState {
  const projection = projectFrontmatter(state.doc.toString());
  if (projection.mode !== 'properties') {
    return {
      projection,
      decorations: Decoration.none,
    };
  }
  return {
    projection,
    decorations: Decoration.set([
      Decoration.replace({
        block: true,
        widget: new FrontmatterPropertiesWidget(projection.fields),
      }).range(projection.range.from, projection.range.to),
    ]),
  };
}

export const frontmatterField = StateField.define<FrontmatterFieldState>({
  create: buildFrontmatterFieldState,
  update(value, transaction) {
    return transaction.docChanged
      ? buildFrontmatterFieldState(transaction.state)
      : value;
  },
  provide: field => EditorView.decorations.from(
    field,
    value => value.decorations,
  ),
});

export function getFrontmatterProjection(state: EditorState): FrontmatterProjection {
  return state.field(frontmatterField, false)?.projection
    ?? projectFrontmatter(state.doc.toString());
}
