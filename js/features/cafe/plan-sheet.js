export function bindPlanSheet(root, plan, renderTable) {
  const dialog = root.querySelector('.cd-plan-sheet');
  const trigger = root.querySelector('[data-cd-plan-open]');
  const preview = root.querySelector('#viewPlan');
  const tap = preview.querySelector('.cd-plan-tap');
  const table = root.querySelector('#viewTable');
  const viewButton = dialog.querySelector('[data-cd-sheet-view]');
  const floor = preview.querySelector('.plan-outer');
  const host = dialog.querySelector('[data-cd-plan-host]');
  const closeButton = dialog.querySelector('[data-cd-plan-close]');
  let previousBody, scrollY, tableWasHidden;

  function returnPlan(restoreFocus) {
    if (!previousBody) return;
    document.body.style.position = previousBody.position;
    document.body.style.inset = previousBody.inset;
    document.body.style.width = previousBody.width;
    previousBody = null;
    preview.prepend(floor);
    preview.after(table);
    table.hidden = tableWasHidden;
    floor.hidden = false;
    plan.setZoom(1 / plan.zoom);
    if (restoreFocus) {
      window.scrollTo({ top: scrollY, behavior: 'instant' });
      trigger.focus({ preventScroll: true });
    }
  }

  function open() {
    if (dialog.open) return;
    scrollY = window.scrollY;
    const style = document.body.style;
    previousBody = { position: style.position, inset: style.inset, width: style.width };
    dialog.showModal();
    style.position = 'fixed';
    style.inset = `-${scrollY}px 0 auto`;
    style.width = '100%';
    tableWasHidden = table.hidden;
    host.append(floor, table);
    showTable(false);
    plan.setZoom(1 / plan.zoom);
    closeButton.focus({ preventScroll: true });
  }

  function showTable(show) {
    floor.hidden = show;
    table.hidden = !show;
    viewButton.textContent = show ? 'Зураглал' : 'Хүснэгт';
    viewButton.setAttribute('aria-pressed', show);
    if (show) table.innerHTML = renderTable();
    else plan.resize();
  }

  trigger.addEventListener('click', open);
  tap.addEventListener('click', open);
  viewButton.addEventListener('click', () => showTable(table.hidden));

  closeButton.addEventListener('click', () => dialog.close());
  dialog.addEventListener('close', () => returnPlan(true));
  return () => {
    trigger.removeEventListener('click', open);
    tap.removeEventListener('click', open);
    returnPlan(false);
    if (dialog.open) dialog.close();
  };
}
