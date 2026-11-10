// Exercise the same navigation a teacher uses. Standalone widgets retain their flat tabs.
export async function openTool(page, id, gesture = 'click') {
  const tab = page.locator('.fe-tab[data-tab="'+id+'"]');
  const name = ['text','element'].includes(id) ? 'add' : id === 'upload' ? 'media' : 'design';
  const group = page.locator('[data-tool-group="'+name+'"]');
  await page.locator('.fe-tabs').first().waitFor();
  if (await group.count()) {
    if (id === 'upload') {
      if (await group.getAttribute('aria-expanded') !== 'true') await group[gesture]();
      return;
    }
    if (!await tab.isVisible()) await group[gesture]();
    await tab.waitFor();
    if (await tab.getAttribute('aria-selected') !== 'true') await tab[gesture]();
  } else await tab[gesture]();
}

// Slide actions (활동 넣기 · 퀴즈 · 결과 가져오기 · 복제 …) live in the page rail's ··· menu.
// On a narrow screen the rail itself is a drawer behind the '장 목록' button.
// An open tool shelf overlays the whole workspace, rail included, so it is closed first.
export async function slideAction(page, selector, gesture = 'click') {
  const action = page.locator(selector).first();
  const shelf = page.getByRole('button', {name: '도구 칸 닫기', exact: true});
  if (await shelf.isVisible()) await shelf[gesture]();
  if (!await action.isVisible()) {
    const menu = page.locator('.cv-tray-menu>summary');
    if (!await menu.isVisible()) {
      const pages = page.locator('.cv-pages-toggle');
      if (await pages.isVisible()) await pages[gesture]();
    }
    await menu[gesture]();
  }
  await action[gesture]();
}

// Open a drawing from the home list by its name. The parts of one imported PPT share a single
// card, so a part (“이름 · 2”) is reached through that card's “파트 N개” first.
export async function openListed(page, name, gesture = 'click') {
  await page.locator('.cv-list .cv-item').first().waitFor();
  const direct = page.getByRole('button', {name: name + ' 열기', exact: true});
  if (!await direct.count()) await page.locator('.cv-deck', {hasText: name.replace(/\s*·\s*\d+$/, '')}).first().locator('.cv-deck-parts')[gesture]();
  await direct[gesture]();
}

// Pick a page (or anything else) in the page rail. An open tool shelf overlays the rail, and on a
// narrow screen the rail is a drawer behind '장 목록' that closes again after a page is picked.
export async function pickPage(page, selector, gesture = 'click') {
  const tile = page.locator(selector).first();
  const shelf = page.getByRole('button', {name: '도구 칸 닫기', exact: true});
  if (await shelf.isVisible()) await shelf[gesture]();
  if (!await tile.isVisible()) {
    const pages = page.locator('.cv-pages-toggle');
    if (await pages.isVisible()) await pages[gesture]();
  }
  await tile[gesture]();
}
