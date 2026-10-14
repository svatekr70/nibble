import { describe, expect, it } from 'vitest';
import { parseWindow } from './dom.js';
import { fromTaskList, isTaskItem, isTaskList, setTaskChecked, toTaskList } from '../../plugins/src/tasks.js';

function list(html: string): Element {
  const { document } = parseWindow();
  const box = document.createElement('div');
  box.innerHTML = html;
  return box.firstElementChild!;
}

describe('úkoly', () => {
  it('z odrážek udělá úkoly, zaškrtnutí nastaví na ne', () => {
    const ul = list('<ul><li>a</li><li>b</li></ul>');
    toTaskList(ul);
    // Po atributech, ne celým `outerHTML`: linkedom nové atributy řadí na
    // začátek, prohlížeč na konec. Přesné pořadí hlídá e2e.
    expect(ul.getAttribute('data-type')).toBe('taskList');
    for (const li of Array.from(ul.children)) {
      expect(li.getAttribute('data-type')).toBe('taskItem');
      expect(li.getAttribute('data-checked')).toBe('false');
    }
    expect(isTaskList(ul)).toBe(true);
    expect(isTaskItem(ul.firstElementChild)).toBe(true);
  });

  it('existující zaškrtnutí nechá', () => {
    const ul = list('<ul><li data-checked="true">a</li></ul>');
    toTaskList(ul);
    expect(ul.firstElementChild!.getAttribute('data-checked')).toBe('true');
  });

  it('zpětný převod odstraní jen svoje atributy', () => {
    const ul = list('<ul data-type="taskList" class="x"><li data-type="taskItem" data-checked="true" id="k">a</li></ul>');
    fromTaskList(ul);
    expect(ul.outerHTML).toBe('<ul class="x"><li id="k">a</li></ul>');
  });

  it('vnořený seznam je samostatný', () => {
    const ul = list('<ul><li>a<ul><li>b</li></ul></li></ul>');
    toTaskList(ul);
    expect(ul.querySelector('ul ul li')!.hasAttribute('data-type')).toBe(false);
  });

  it('přepnutí zaškrtnutí', () => {
    const ul = list('<ul data-type="taskList"><li data-type="taskItem" data-checked="false">a</li></ul>');
    setTaskChecked(ul.firstElementChild!, true);
    expect(ul.firstElementChild!.getAttribute('data-checked')).toBe('true');
  });
});
