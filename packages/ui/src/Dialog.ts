import type { DialogField, DialogSpec } from '@nibble/core';
import { buildCodeField } from './CodeField.js';
import { buildGlyphField } from './GlyphPicker.js';

/**
 * Dialogy.
 *
 * Staví na nativním `<dialog showModal()>`: past na fokus, zavření Escapem
 * i podkladová vrstva jsou tím vyřešené a nemusí se to psát znovu. Volajícímu
 * se vrací Promise — data, nebo null, když dialog zavřel.
 */

function labelFor(field: DialogField): string {
  return field.label ?? field.name;
}

function buildField(field: DialogField, initial: unknown, doc: Document): HTMLElement {
  const wrap = doc.createElement('div');
  wrap.className = 'nb-field';

  if (field.type === 'html') {
    wrap.innerHTML = field.html ?? '';
    return wrap;
  }

  // Mřížka znaků si popisek nese sama — nad ní by visel nadpis, který jen
  // opakuje název dialogu.
  if (field.type === 'emoji' || field.type === 'chars') {
    const picker = buildGlyphField(doc, field);
    wrap.classList.add('nb-field-grow');
    wrap.append(picker.element, picker.input);
    return wrap;
  }

  const id = 'nb-f-' + field.name;
  const label = doc.createElement('label');
  label.htmlFor = id;
  label.textContent = labelFor(field);
  wrap.appendChild(label);

  let input: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;

  if (field.type === 'code') {
    const code = buildCodeField(doc, String(initial ?? ''), field.selection);
    code.textarea.id = id;
    code.textarea.name = field.name;
    wrap.appendChild(code.element);
    wrap.classList.add('nb-field-grow');
    return wrap;
  }

  if (field.type === 'textarea') {
    input = doc.createElement('textarea');
    input.rows = 4;
    input.value = String(initial ?? '');
  } else if (field.type === 'select') {
    const select = doc.createElement('select');
    for (const option of field.options ?? []) {
      const el = doc.createElement('option');
      el.value = option.value;
      el.textContent = option.text;
      select.appendChild(el);
    }
    select.value = String(initial ?? '');
    input = select;
  } else {
    const el = doc.createElement('input');
    el.type = field.type === 'url' ? 'url'
      : field.type === 'number' ? 'number'
      : field.type === 'checkbox' ? 'checkbox'
      : field.type === 'file' ? 'file'
      : 'text';
    if (field.type === 'checkbox') el.checked = Boolean(initial);
    else if (field.type !== 'file') el.value = String(initial ?? '');
    if (field.accept) el.accept = field.accept;
    if (field.placeholder) el.placeholder = field.placeholder;
    input = el;
  }

  input.id = id;
  input.name = field.name;
  input.className = 'nb-input';
  if (field.required) input.required = true;
  if (field.type === 'checkbox') wrap.classList.add('nb-field-inline');

  wrap.appendChild(input);
  return wrap;
}

function readValue(form: HTMLFormElement, field: DialogField): unknown {
  const el = form.elements.namedItem(field.name);
  if (!el) return undefined;

  if (field.type === 'checkbox') return (el as HTMLInputElement).checked;
  if (field.type === 'number') {
    const raw = (el as HTMLInputElement).value;
    return raw === '' ? undefined : Number(raw);
  }
  if (field.type === 'file') return (el as HTMLInputElement).files?.[0] ?? null;
  return (el as HTMLInputElement).value;
}

export function openDialog(spec: DialogSpec, doc: Document): Promise<Record<string, unknown> | null> {
  const dialog = doc.createElement('dialog');
  dialog.className = 'nb-dialog' + (spec.size === 'large' ? ' nb-dialog-large' : '');

  const form = doc.createElement('form');
  form.method = 'dialog';
  form.noValidate = false;

  const heading = doc.createElement('h2');
  heading.className = 'nb-dialog-title';
  heading.textContent = spec.title;
  form.appendChild(heading);

  const body = doc.createElement('div');
  body.className = 'nb-dialog-body';
  for (const field of spec.fields) {
    body.appendChild(buildField(field, spec.initial?.[field.name], doc));
  }
  form.appendChild(body);

  const footer = doc.createElement('div');
  footer.className = 'nb-dialog-footer';

  const cancel = doc.createElement('button');
  cancel.type = 'button';
  cancel.className = 'nb-dialog-btn';
  cancel.textContent = spec.cancelLabel ?? 'Zrušit';

  const submit = doc.createElement('button');
  submit.type = 'submit';
  submit.className = 'nb-dialog-btn nb-dialog-btn-primary';
  submit.textContent = spec.submitLabel ?? 'Použít';

  footer.append(cancel, submit);
  form.appendChild(footer);
  dialog.appendChild(form);
  doc.body.appendChild(dialog);

  return new Promise((resolve) => {
    let result: Record<string, unknown> | null = null;

    form.addEventListener('submit', (event) => {
      // `method="dialog"` by dialog zavřel dřív, než stihneme přečíst hodnoty.
      event.preventDefault();
      if (!form.reportValidity()) return;

      result = {};
      for (const field of spec.fields) {
        if (field.type === 'html') continue;
        result[field.name] = readValue(form, field);

        // U kódu se vrací i poloha kurzoru, aby se dala přenést zpátky
        // do obsahu.
        if (field.type === 'code') {
          const area = form.elements.namedItem(field.name) as HTMLTextAreaElement | null;
          if (area) result['__caret'] = area.selectionStart;
        }
      }
      dialog.close();
    });

    cancel.addEventListener('click', () => { result = null; dialog.close(); });

    dialog.addEventListener('close', () => {
      dialog.remove();
      resolve(result);
    });

    dialog.showModal();

    // Pole s kódem si kurzor umístí samo — má ho postavit na místo, kde
    // uživatel stál v obsahu, ne na začátek.
    const code = form.querySelector<HTMLTextAreaElement>('.nb-code-input');
    if (code) return;

    const first = form.querySelector<HTMLElement>('.nb-input');
    first?.focus();

    if (first instanceof HTMLInputElement && first.type === 'text') {
      first.select();
    } else if (first instanceof HTMLTextAreaElement) {
      // Zaostření položí kurzor na konec a textarea se odroluje s ním. U zdroje
      // dokumentu tím uživatel vidí poslední řádky místo prvních.
      first.setSelectionRange(0, 0);
      first.scrollTop = 0;
    }
  });
}
